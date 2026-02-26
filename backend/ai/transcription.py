"""
Pipeline IA pour les appels : Whisper (transcription) + GPT-4o (double analyse).
- Feedback Sales : coaching, résumé, opportunités, sentiment client
- Feedback Admin : scoring qualité sur critères personnalisables
"""
import json
import tempfile
from pathlib import Path

import httpx
from openai import OpenAI

from config import get_settings

settings = get_settings()


def _get_openai_client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


async def download_recording(url: str) -> Path:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        data = response.content

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tmp.write(data)
    tmp.close()
    return Path(tmp.name)


def transcribe_audio(file_path: Path) -> str:
    client = _get_openai_client()
    with open(file_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            language="fr",
            response_format="text",
        )
    return result


SALES_PROMPT = """Tu es un coach commercial expert pour Gourmet Food France (viande premium B2B).
Analyse cette transcription d'appel commercial et fournis un JSON structuré :

{
  "is_voicemail": false,
  "summary": "Résumé en 2-3 phrases de l'appel",
  "client_sentiment": "positive" | "neutral" | "negative",
  "sales_feedback": "Feedback constructif pour le commercial : ce qui a bien marché, ce qui peut être amélioré, conseils concrets (3-5 phrases)",
  "detected_opportunities": "Opportunités commerciales détectées (upsell, nouveaux produits, augmentation volume...) ou null",
  "next_actions": "Actions à suivre recommandées (rappel, devis, livraison test...)",
  "key_topics": ["liste", "des", "sujets", "abordés"]
}

IMPORTANT — Détection répondeur :
- Si la transcription correspond à un message laissé sur un répondeur / boîte vocale (ex: message d'accueil type "vous êtes sur le répondeur", bip, message unilatéral court), mets "is_voicemail": true.
- Un répondeur typique : un seul locuteur laisse un message, pas de conversation bidirectionnelle.
- Si c'est une vraie conversation (échange entre 2+ personnes), mets "is_voicemail": false.

Réponds UNIQUEMENT avec le JSON, sans markdown ni commentaire."""

ADMIN_PROMPT = """Tu es un directeur commercial expert qui évalue la qualité des appels de son équipe.
Analyse cette transcription et note le commercial sur chaque critère de 1 à 10.

Critères :
- politeness_score : Politesse, professionnalisme, ton adapté
- objection_handling : Capacité à reformuler et traiter les objections
- closing_attempt : Tentative de conclure (prise de commande, RDV, devis)
- product_knowledge : Maîtrise des produits (gamme, origine, qualité)
- listening_quality : Écoute active, questions pertinentes

Fournis un JSON :
{
  "politeness_score": 8,
  "objection_handling": 6,
  "closing_attempt": 7,
  "product_knowledge": 9,
  "listening_quality": 5,
  "overall_score": 7,
  "admin_feedback": "Feedback détaillé pour le manager : points forts, axes d'amélioration, recommandations de formation si nécessaire (3-5 phrases)"
}

Réponds UNIQUEMENT avec le JSON, sans markdown ni commentaire."""


def analyze_for_sales(transcription: str) -> dict:
    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SALES_PROMPT},
            {"role": "user", "content": transcription},
        ],
        max_tokens=600,
        temperature=0.3,
    )
    raw = response.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"summary": raw, "client_sentiment": "neutral", "sales_feedback": raw}


def analyze_for_admin(transcription: str) -> dict:
    client = _get_openai_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": ADMIN_PROMPT},
            {"role": "user", "content": transcription},
        ],
        max_tokens=400,
        temperature=0.2,
    )
    raw = response.choices[0].message.content or "{}"
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"overall_score": None, "admin_feedback": raw}


async def full_analysis(record_url: str, duration_seconds: int = 0) -> dict:
    """Pipeline complet : download → transcription → double analyse (sales + admin)."""
    file_path = await download_recording(record_url)
    try:
        transcription = transcribe_audio(file_path)
        if not transcription.strip():
            return {"transcript": "", "summary": "Appel sans contenu audible."}

        sales_data = analyze_for_sales(transcription)
        admin_data = analyze_for_admin(transcription)

        return {
            "transcript": transcription,
            "summary": sales_data.get("summary", ""),
            "client_sentiment": sales_data.get("client_sentiment", "neutral"),
            "sales_feedback": sales_data.get("sales_feedback", ""),
            "detected_opportunities": sales_data.get("detected_opportunities"),
            "next_actions": sales_data.get("next_actions"),
            "key_topics": sales_data.get("key_topics", []),
            "is_voicemail": bool(sales_data.get("is_voicemail", False)),
            "politeness_score": admin_data.get("politeness_score"),
            "objection_handling": admin_data.get("objection_handling"),
            "closing_attempt": admin_data.get("closing_attempt"),
            "product_knowledge": admin_data.get("product_knowledge"),
            "listening_quality": admin_data.get("listening_quality"),
            "overall_score": admin_data.get("overall_score"),
            "admin_feedback": admin_data.get("admin_feedback", ""),
            "admin_scores_raw": admin_data,
            "duration_seconds": duration_seconds,
        }
    finally:
        file_path.unlink(missing_ok=True)
