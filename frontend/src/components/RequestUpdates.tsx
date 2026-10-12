import React, { useEffect, useRef, useState } from 'react';
import { getPublicPhotoContent, getPublicPhotos, getPublicQuestions, getPublicTimeline, replyToQuestion, uploadPublicPhoto, validatePhotos } from '../services/api';
import { PublicPhoto, PublicQuestion, PublicTimelineEvent } from '../types';
import { formatTimestamp } from '../utils/publicRequest';

const PhotoPreview: React.FC<{ requestId: string; token: string; photo: PublicPhoto }> = ({ requestId, token, photo }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const controller = new AbortController();
    void getPublicPhotoContent(requestId, token, photo.id, controller.signal).then(result => {
      if (!active) return;
      if (result.success) { objectUrl = URL.createObjectURL(result.data); setUrl(objectUrl); setError(''); }
      else setError(result.errorMessage);
    });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [requestId, token, photo.id, loadCount]);
  return <figure className="evidence-photo">
    {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Supporting photo: ${photo.filename}`} /></a> : <p>{error || 'Loading photo…'} {error && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLoadCount(count => count + 1)}>Retry photo</button>}</p>}
    <figcaption>{photo.filename} · {Math.ceil(photo.size_bytes / 1024)} KB<br /><span>{formatTimestamp(photo.created_at)}</span></figcaption>
  </figure>;
};

export const RequestUpdates: React.FC<{ requestId: string; token: string }> = ({ requestId, token }) => {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [timeline, setTimeline] = useState<PublicTimelineEvent[]>([]);
  const [photos, setPhotos] = useState<PublicPhoto[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    let active = true;
    let loading = false;
    const controller = new AbortController();
    const load = async () => {
      if (loading) return;
      loading = true;
      const results = await Promise.all([
        getPublicQuestions(requestId, token, controller.signal),
        getPublicTimeline(requestId, token, controller.signal),
        getPublicPhotos(requestId, token, controller.signal),
      ]);
      if (!active) return;
      const [questionResult, timelineResult, photoResult] = results;
      if (questionResult.success) setQuestions(questionResult.data);
      if (timelineResult.success) setTimeline(timelineResult.data);
      if (photoResult.success) setPhotos(photoResult.data);
      setError(results.filter(result => !result.success).map(result => result.errorMessage).join(' '));
      loading = false;
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [requestId, token, refresh]);

  const submitAnswer = async (event: React.FormEvent, questionId: number) => {
    event.preventDefault();
    const answer = (answers[questionId] || '').trim();
    if (!answer || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    const result = await replyToQuestion(requestId, token, questionId, answer);
    if (!mounted.current) return;
    if (result.success) {
      setMessage('Reply sent to the response team. Your original report has been preserved.');
      setAnswers(previous => ({ ...previous, [questionId]: '' }));
      setRefresh(value => value + 1);
    } else setMessage(result.errorMessage);
    inFlight.current = false; setBusy(false);
  };

  const uploadPhotos = async () => {
    if (inFlight.current || !selectedFiles.length) return;
    const validation = validatePhotos(selectedFiles, photos.length);
    if (validation) { setMessage(validation); return; }
    inFlight.current = true; setBusy(true); setMessage('Uploading photos…');
    const failures: File[] = [];
    const messages: string[] = [];
    for (const photo of selectedFiles) {
      const result = await uploadPublicPhoto(requestId, token, photo);
      if (!result.success) { failures.push(photo); messages.push(`${photo.name}: ${result.errorMessage}`); }
    }
    if (!mounted.current) return;
    setSelectedFiles(failures);
    if (!failures.length && fileInput.current) fileInput.current.value = '';
    setMessage(failures.length ? `Some photos were not uploaded. ${messages.join(' ')} Check the gallery before retrying.` : 'Photos uploaded for human review.');
    setRefresh(value => value + 1);
    inFlight.current = false; setBusy(false);
  };

  return <div className="request-updates">
    {error && <p role="status" className="alert alert-danger">Questions, timeline, or photos could not refresh: {error} Last available details remain visible; retrying every five seconds.</p>}
    {message && <p role="status" className="alert">{message}</p>}
    <section className="form-section-card">
      <h3>Questions from the response team</h3>
      <p className="form-helper">Answer a specific question to help responders review your request. Replies become part of its history.</p>
      {!questions.length && <p>No follow-up questions have been sent.</p>}
      {questions.map(question => <article key={question.id} className="question-card">
        <h4>{question.question}</h4>
        <p className="form-helper">{question.asked_by || 'Response team'} · {formatTimestamp(question.asked_at)}</p>
        {question.answer ? <div className="answered-question"><strong>Your reply</strong><p>{question.answer}</p><small>{formatTimestamp(question.answered_at)}</small></div> : <form onSubmit={event => { void submitAnswer(event, question.id); }}>
          <label className="form-label" htmlFor={`reply-${question.id}`}>Your reply</label>
          <textarea id={`reply-${question.id}`} className="form-input" rows={3} maxLength={2000} value={answers[question.id] || ''} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: event.target.value }))} required />
          <button type="submit" className="btn btn-primary btn-sm mt-3" disabled={busy || !(answers[question.id] || '').trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
        </form>}
      </article>)}
    </section>

    <section className="form-section-card">
      <h3>Supporting photos</h3>
      <p className="form-helper">Images support human review. Uploaded photos are accessible to authorized responders and anyone with your request ID and access key.</p>
      <div className="evidence-gallery">{photos.map(photo => <PhotoPreview key={photo.id} requestId={requestId} token={token} photo={photo} />)}</div>
      {!photos.length && <p>No photos have been uploaded.</p>}
      {photos.length < 3 && <div className="form-group">
        <label className="form-label" htmlFor="tracking-photos">Add or retry photos ({3 - photos.length} slots remaining)</label>
        <input id="tracking-photos" ref={fileInput} className="form-input" type="file" accept="image/jpeg,image/png" multiple disabled={busy} onChange={event => {
          const files = Array.from(event.target.files || []);
          const validation = validatePhotos(files, photos.length);
          if (validation) { setMessage(validation); setSelectedFiles([]); event.target.value = ''; }
          else { setSelectedFiles(files); setMessage(''); }
        }} />
        <p className="form-helper">JPEG or PNG, up to 3 MB each. Up to 3 photos per request.</p>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !selectedFiles.length} onClick={() => { void uploadPhotos(); }}>{busy ? 'Uploading…' : 'Upload selected photos'}</button>
      </div>}
    </section>

    <section className="form-section-card">
      <h3>Decision and delivery timeline</h3>
      {!timeline.length ? <p>No timeline events are available yet.</p> : <ol className="request-timeline">
        {timeline.map(event => <li key={event.id}><strong>{event.summary}</strong><p className="form-helper">{formatTimestamp(event.created_at)}{event.actor_name ? ` · ${event.actor_name}` : ''}</p></li>)}
      </ol>}
      <p className="form-helper">This timeline shows updates intended for you. Internal investigation notes remain with the response team.</p>
    </section>
  </div>;
};
