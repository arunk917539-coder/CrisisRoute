"""Incident context, citizen follow-ups, private evidence and stale review tools."""
import base64
import binascii
from datetime import datetime, timezone
from io import BytesIO
import os
from pathlib import Path
import secrets
import warnings

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import Field
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from .auth import bearer_user, current_actor, token_hash
from .db import get_db
from .models import Allocation, AuditEvent, Delivery, FollowupQuestion, Need, Photo, Relationship, Report
from .schemas import InputModel

router = APIRouter()
MAX_PHOTO_BYTES = 3 * 1024 * 1024
MAX_PHOTO_PIXELS = 20_000_000


def api():
    # Resolve only when handling a request, after main has registered its routes.
    from . import main
    return main


def report_or_404(db, report_id):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


def check_tracking(report, token, required=False):
    import hmac
    if not report.tracking_token_hash:
        if required:
            raise HTTPException(403, "This legacy request has no private tracking key; contact a responder")
        return
    if not token or len(token) > 200 or not hmac.compare_digest(report.tracking_token_hash, token_hash(token)):
        raise HTTPException(403, "The private tracking key is required for this request")


def public_report(db, request_id, token):
    report = report_or_404(db, api().parse_public_request_id(request_id))
    check_tracking(report, token, required=True)
    return report


class QuestionCreate(InputModel):
    question: str = Field(min_length=3, max_length=1000)


class ReplyCreate(InputModel):
    question_id: int = Field(gt=0)
    answer: str = Field(min_length=1, max_length=2000)


class Reconfirm(InputModel):
    note: str = Field(min_length=3, max_length=1000)


class PhotoCreate(InputModel):
    filename: str = Field(min_length=1, max_length=200)
    data_base64: str = Field(min_length=4, max_length=4_194_304)


def question_response(item, public=False):
    return {"id": item.id, "question": item.question, "answer": item.answer,
            "asked_at": api().iso(item.asked_at), "answered_at": api().iso(item.answered_at),
            "asked_by": "Responder" if public else item.asked_by}


def questions(db, report_id, public=False):
    return [question_response(item, public) for item in db.query(FollowupQuestion).filter_by(report_id=report_id).order_by(FollowupQuestion.id).all()]


@router.get("/reports/{report_id}/questions")
def get_questions(report_id: int, db: Session = Depends(get_db)):
    report_or_404(db, report_id)
    return questions(db, report_id)


@router.post("/reports/{report_id}/questions")
def ask_question(report_id: int, payload: QuestionCreate, db: Session = Depends(get_db)):
    report = report_or_404(db, report_id)
    if not report.tracking_token_hash:
        raise HTTPException(409, "This report has no citizen tracking key and cannot receive a private citizen reply")
    question = FollowupQuestion(report_id=report.id, question=payload.question,
                                asked_by=current_actor.get() or "Responder")
    db.add(question)
    api().touch_report(report)
    api().audit(db, "question_asked", "report", report.id, "Responder requested additional information")
    db.commit()
    db.refresh(question)
    return question_response(question)


@router.get("/public/requests/{request_id}/questions")
def public_questions(request_id: str, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    report = public_report(db, request_id, x_tracking_token)
    return questions(db, report.id, public=True)


@router.post("/public/requests/{request_id}/replies")
def reply(request_id: str, payload: ReplyCreate, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    report = public_report(db, request_id, x_tracking_token)
    question = db.get(FollowupQuestion, payload.question_id)
    if not question or question.report_id != report.id:
        raise HTTPException(404, "Question not found for this request")
    now = datetime.now(timezone.utc)
    changed = db.execute(update(FollowupQuestion).where(FollowupQuestion.id == question.id, FollowupQuestion.answer.is_(None)).values(answer=payload.answer, answered_at=now)).rowcount
    if not changed:
        raise HTTPException(409, "This question already has an answer")
    # The conditional update above obtains the write lock; use a timestamp after
    # that lock so an intervening review cannot acknowledge this unseen reply.
    report.evidence_updated_at = datetime.now(timezone.utc)
    api().touch_report(report)
    api().audit(db, "citizen_reply", "report", report.id, "Citizen supplied additional information; evidence requires review")
    db.commit()
    db.refresh(question)
    return question_response(question, public=True)


def report_timeline(db, report_ids, public=False):
    report_ids = set(report_ids)
    need_ids = {n.id for n in db.query(Need).filter(Need.report_id.in_(report_ids)).all()}
    allocation_ids = {a.id for a in db.query(Allocation).filter(Allocation.need_id.in_(need_ids)).all()} if need_ids else set()
    delivery_ids = {d.id for d in db.query(Delivery).filter(Delivery.need_id.in_(need_ids)).all()} if need_ids else set()
    relationship_ids = {r.id for r in db.query(Relationship).filter(or_(Relationship.report_a_id.in_(report_ids), Relationship.report_b_id.in_(report_ids))).all()} if not public else set()
    entity_ids = {"report": report_ids, "need": need_ids, "allocation": allocation_ids, "delivery": delivery_ids, "relationship": relationship_ids}
    rows = db.query(AuditEvent).order_by(AuditEvent.created_at, AuditEvent.id).all()
    result = []
    public_labels = {
        "public_report_created": "Request submitted", "report_created": "Request recorded",
        "evidence_reviewed": "Responder reviewed the evidence", "need_verified": "Relief requirement verified",
        "report_reviewed": "Responder recorded a review decision", "resource_allocated": "Supplies allocated",
        "delivery_recorded": "Delivery recorded", "question_asked": "Responder requested more information",
        "citizen_reply": "Your additional information was received", "photo_uploaded": "Supporting photo added",
        "report_reconfirmed": "Responder reconfirmed the report",
    }
    for row in rows:
        if row.entity_id not in entity_ids.get(row.entity_type, set()):
            continue
        if public and row.event_type not in public_labels:
            continue
        summary = row.summary
        if public:
            summary = public_labels[row.event_type]
            if row.event_type == "report_reviewed":
                # Review notes are already part of the citizen-safe projection.
                import re
                match = re.search(r" as (verified|rejected|unresolved)(.*)$", row.summary)
                if match:
                    summary = "Review decision: " + match.group(1) + match.group(2)
            if row.event_type == "need_verified":
                need = db.get(Need, row.entity_id)
                if need:
                    summary += f": {need.verified_quantity:g} {need.unit}"
            if row.event_type == "resource_allocated":
                allocation = db.get(Allocation, row.entity_id)
                need = db.get(Need, allocation.need_id) if allocation else None
                if need:
                    summary += f": {allocation.allocated_quantity:g} {need.unit}"
            if row.event_type == "delivery_recorded":
                delivery = db.get(Delivery, row.entity_id)
                need = db.get(Need, delivery.need_id) if delivery else None
                if need:
                    summary += f": {delivery.delivered_quantity:g} {need.unit}"
        result.append({"id": row.id, "event_type": row.event_type, "summary": summary,
                       "created_at": api().iso(row.created_at), "actor_name": None if public else row.actor_name})
    return result


@router.get("/reports/{report_id}/timeline")
def timeline(report_id: int, db: Session = Depends(get_db)):
    report_or_404(db, report_id)
    return report_timeline(db, [report_id])


@router.get("/public/requests/{request_id}/timeline")
def public_timeline(request_id: str, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    report = public_report(db, request_id, x_tracking_token)
    return report_timeline(db, [report.id], public=True)


def photo_response(item):
    return {"id": item.id, "filename": item.filename, "content_type": item.content_type,
            "size_bytes": item.size_bytes, "created_at": api().iso(item.created_at)}


def photo_directory():
    # This directory is deliberately never mounted as public static content.
    return Path(os.environ.get("CRISISROUTE_PHOTO_DIR", str(Path(__file__).resolve().parents[1] / "private_uploads"))).resolve()


def save_photo(db, report, payload):
    try:
        raw = base64.b64decode(payload.data_base64, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Photo must contain valid base64 data")
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Each photo must be at most 3 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as original:
                if original.format not in {"JPEG", "PNG"}:
                    raise HTTPException(422, "Only JPEG and PNG photos are supported")
                if original.width * original.height > MAX_PHOTO_PIXELS:
                    raise HTTPException(422, "Photo exceeds the 20 megapixel limit")
                original.load()
                # Rebuilding pixel data strips EXIF, text chunks and attached metadata.
                oriented = ImageOps.exif_transpose(original).convert("RGB")
                sanitized = Image.frombytes("RGB", oriented.size, oriented.tobytes())
                output = BytesIO()
                sanitized.save(output, format="JPEG", quality=85, optimize=True)
                data = output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(422, "Photo is not a supported valid image")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Processed photo is too large; use a smaller image")
    # Acquire a write lock before checking the cap, preventing concurrent uploads
    # from exceeding it in the supported SQLite deployment.
    now = datetime.now(timezone.utc)
    db.execute(update(Report).where(Report.id == report.id).values(updated_at=now))
    now = datetime.now(timezone.utc)
    if db.query(Photo).filter_by(report_id=report.id).count() >= 3:
        raise HTTPException(409, "A report can contain at most three photos")
    directory = photo_directory()
    directory.mkdir(parents=True, exist_ok=True)
    storage_name = secrets.token_hex(24) + ".jpg"
    path = directory / storage_name
    filename = Path(payload.filename.replace("\\", "/")).stem[:100] or "evidence"
    item = Photo(report_id=report.id, filename=filename + ".jpg", storage_name=storage_name,
                 content_type="image/jpeg", size_bytes=len(data))
    try:
        path.write_bytes(data)
        db.add(item)
        report.evidence_status = "photo"
        report.evidence_updated_at = now
        api().touch_report(report)
        api().audit(db, "photo_uploaded", "report", report.id, "Supporting photo added; evidence requires review")
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    db.refresh(item)
    return photo_response(item)


@router.get("/reports/{report_id}/photos")
def get_photos(report_id: int, db: Session = Depends(get_db)):
    report_or_404(db, report_id)
    return [photo_response(item) for item in db.query(Photo).filter_by(report_id=report_id).order_by(Photo.id).all()]


@router.post("/reports/{report_id}/photos")
def upload_photo(report_id: int, payload: PhotoCreate, db: Session = Depends(get_db)):
    return save_photo(db, report_or_404(db, report_id), payload)


@router.get("/public/requests/{request_id}/photos")
def get_public_photos(request_id: str, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    report = public_report(db, request_id, x_tracking_token)
    return get_photos(report.id, db)


@router.post("/public/requests/{request_id}/photos")
def upload_public_photo(request_id: str, payload: PhotoCreate, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    return save_photo(db, public_report(db, request_id, x_tracking_token), payload)


def photo_content(db, item):
    path = photo_directory() / item.storage_name
    if not path.is_file():
        raise HTTPException(404, "Photo content is unavailable")
    return FileResponse(path, media_type=item.content_type, filename=item.filename,
                        content_disposition_type="inline", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/photos/{photo_id}/content")
def get_photo_content(photo_id: int, request: Request, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    item = db.get(Photo, photo_id)
    if not item:
        raise HTTPException(404, "Photo not found")
    if request.headers.get("authorization"):
        bearer_user(db, request.headers.get("authorization"))
    else:
        check_tracking(report_or_404(db, item.report_id), x_tracking_token, required=True)
    return photo_content(db, item)


@router.get("/public/requests/{request_id}/photos/{photo_id}/content")
def get_public_photo_content(request_id: str, photo_id: int, x_tracking_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    report = public_report(db, request_id, x_tracking_token)
    item = db.get(Photo, photo_id)
    if not item or item.report_id != report.id:
        raise HTTPException(404, "Photo not found for this request")
    return photo_content(db, item)


def confirmation_age(report):
    confirmed = report.last_confirmed_at or report.reviewed_at or report.timestamp
    return confirmed, max(0, (datetime.now(timezone.utc) - confirmed.replace(tzinfo=timezone.utc)).total_seconds() / 3600)


def stale_threshold():
    try:
        return max(1.0, min(8760.0, float(os.environ.get("CRISISROUTE_STALE_HOURS", "24"))))
    except ValueError:
        return 24.0


def is_stale(report):
    return report.verification_status == "verified" and confirmation_age(report)[1] >= stale_threshold()


@router.get("/stale-reviews")
def stale_reviews(db: Session = Depends(get_db)):
    rows = []
    for report in db.query(Report).filter_by(verification_status="verified").all():
        if not is_stale(report):
            continue
        confirmed, age = confirmation_age(report)
        rows.append({"report_id": report.id, "description": report.description, "location": report.location,
                     "priority": report.priority, "last_confirmed_at": api().iso(confirmed), "age_hours": round(age, 1),
                     "reason": f"No reconfirmation for at least {stale_threshold():g} hours"})
    return sorted(rows, key=lambda row: row["age_hours"], reverse=True)


@router.post("/reports/{report_id}/reconfirm")
def reconfirm(report_id: int, payload: Reconfirm, db: Session = Depends(get_db)):
    report = report_or_404(db, report_id)
    if report.verification_status != "verified":
        raise HTTPException(409, "Only a verified report can be reconfirmed")
    if not api().evidence_was_reviewed(db, report.id):
        raise HTTPException(409, "Review any new evidence before reconfirming")
    report.last_confirmed_at = datetime.now(timezone.utc)
    api().touch_report(report)
    api().audit(db, "report_reconfirmed", "report", report.id, f"Responder reconfirmed report: {payload.note}")
    db.commit()
    return {"report_id": report.id, "last_confirmed_at": api().iso(report.last_confirmed_at)}


def incident_groups(db):
    reports = {report.id: report for report in db.query(Report).order_by(Report.id).all()}
    remaining = set(reports)
    while remaining:
        first = min(remaining)
        group = api().confirmed_duplicate_report_ids(db, first) & set(reports)
        remaining -= group
        yield [reports[report_id] for report_id in sorted(group)]


def incident_response(db, group, detail=False):
    ids = [r.id for r in group]
    links = db.query(Relationship).filter(or_(Relationship.report_a_id.in_(ids), Relationship.report_b_id.in_(ids))).all()
    priority_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    primary = group[0]
    result = {"id": primary.id, "title": f"{primary.category} — {primary.location}",
              "priority": max((r.priority for r in group), key=lambda value: priority_order.get(value, 0)),
              "report_ids": ids, "report_count": len(ids),
              "conflict_count": sum(link.relationship_type == "possible_conflict" and link.decision != "reject" for link in links),
              "unresolved_count": sum(r.verification_status in {"unverified", "unresolved"} for r in group),
              "stale_count": sum(is_stale(r) for r in group),
              "needs": [api().need_coverage(db, need) for need in db.query(Need).filter(Need.report_id.in_(ids)).all()]}
    if detail:
        result.update(reports=[api().report_response(db, report) for report in group],
                      relationships=[{"id": link.id, "report_a_id": link.report_a_id, "report_b_id": link.report_b_id,
                                      "relationship_type": link.relationship_type, "similarity": link.similarity,
                                      "reason": link.reason, "decision": link.decision} for link in links],
                      timeline=report_timeline(db, ids))
    return result


@router.get("/incidents")
def incidents(db: Session = Depends(get_db)):
    return [incident_response(db, group) for group in incident_groups(db)]


@router.get("/incidents/{incident_id}")
def incident(incident_id: int, db: Session = Depends(get_db)):
    for group in incident_groups(db):
        if any(report.id == incident_id for report in group):
            return incident_response(db, group, detail=True)
    raise HTTPException(404, "Incident not found")


@router.get("/ai/status")
def ai_status():
    from .semantic import semantic_status
    return semantic_status()


@router.post("/reports/{report_id}/ai-compare")
def ai_compare(report_id: int, db: Session = Depends(get_db)):
    from .semantic import compare_reports
    report = report_or_404(db, report_id)
    others = db.query(Report).filter(Report.id != report.id).all()
    suggestions = compare_reports(report, others)
    for suggestion in suggestions:
        low, high = sorted([report.id, suggestion["report_id"]])
        existing = db.query(Relationship).filter_by(report_a_id=low, report_b_id=high).first()
        if existing is None:
            db.add(Relationship(report_a_id=low, report_b_id=high, relationship_type=suggestion["relationship_type"],
                                similarity=suggestion["similarity"], reason=suggestion["reason"], decision="unresolved"))
    api().audit(db, "ai_comparison", "report", report.id, f"AI comparison returned {len(suggestions)} advisory candidates; human decisions required")
    db.commit()
    return {"suggestions": suggestions, "advisory_only": True}
