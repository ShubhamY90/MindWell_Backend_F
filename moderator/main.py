from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch.nn.functional as F

tokenizer = AutoTokenizer.from_pretrained("unitary/toxic-bert")
model = AutoModelForSequenceClassification.from_pretrained("unitary/toxic-bert")

app = FastAPI()

class TextRequest(BaseModel):
    text: str

@app.post("/moderate")
async def moderate_text(request: TextRequest):
    # Tokenize input
    inputs = tokenizer(request.text, return_tensors="pt")

    # Run model
    outputs = model(**inputs)
    probs = F.softmax(outputs.logits, dim=-1).detach().cpu().numpy()[0]

    # Map to labels
    labels = model.config.id2label
    output = {labels[i]: float(probs[i]) for i in range(len(probs))}

    toxic_flag = max(output.values()) > 0.7
    return {"input": request.text, "labels": output, "toxic": toxic_flag}



@app.get("/")
async def root():
    return {"message": "Moderation API is running 🚀"} 