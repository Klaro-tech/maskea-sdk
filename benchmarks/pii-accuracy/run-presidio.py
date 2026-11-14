"""Runs Microsoft Presidio (default recognizers, spaCy en_core_web_sm) over dataset.json -> predictions-presidio.json."""
import json, sys, os
from presidio_analyzer.predefined_recognizers import InAadhaarRecognizer, InGstinRecognizer, InPanRecognizer
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

here = os.path.dirname(os.path.abspath(__file__))
SET = os.environ.get("SET", "")
docs = json.load(open(os.path.join(here, f"dataset{SET}.json")))
nlp = NlpEngineProvider(nlp_configuration={"nlp_engine_name": "spacy", "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}]}).create_engine()
analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])
# Presidio ships India recognizers but they are not in its default set; the "india" run switches them on so the comparison is fair.
INDIA = len(sys.argv) > 1 and sys.argv[1] == "india"
if INDIA:
    for rec in (InAadhaarRecognizer(), InGstinRecognizer(), InPanRecognizer()):
        analyzer.registry.add_recognizer(rec)
LABEL = {"EMAIL_ADDRESS": "EMAIL", "PHONE_NUMBER": "PHONE", "US_SSN": "SSN", "CREDIT_CARD": "CARD", "IN_AADHAAR": "AADHAAR", "IN_PAN": "PAN",
         "IN_GSTIN": "GSTIN", "PERSON": "PERSON", "LOCATION": "LOCATION"}
out = []
for d in docs:
    res = analyzer.analyze(text=d["text"], language="en")
    out.append([{"type": LABEL[r.entity_type], "start": r.start, "end": r.end} for r in res if r.entity_type in LABEL])
json.dump(out, open(os.path.join(here, f"predictions-presidio-india{SET}.json" if INDIA else f"predictions-presidio{SET}.json"), "w"))
print(f"presidio{' +india' if INDIA else ''}: {sum(len(x) for x in out)} predictions over {len(docs)} documents")
