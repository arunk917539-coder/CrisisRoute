import os
os.chdir(os.path.dirname(os.path.dirname(__file__)))
from app.reconcile import contradiction_signal

def test_contradiction(): assert contradiction_signal("Road blocked", "Road passable")
def test_other_contradiction(): assert contradiction_signal("road closed", "road open")
