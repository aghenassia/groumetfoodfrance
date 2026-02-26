import re
import phonenumbers


def normalize_phone(raw_phone: str | None, default_region: str = "FR") -> str | None:
    """Normalise un numéro de téléphone brut au format E.164 (+33612345678)."""
    if not raw_phone:
        return None

    cleaned = raw_phone.strip()

    # Nettoyer les artefacts Excel : ="..." ou ="0123..."
    cleaned = re.sub(r'^="?|"$', "", cleaned)

    # Supprimer les caractères parasites
    cleaned = re.sub(r"[^\d+\s\-().x]", "", cleaned)
    cleaned = cleaned.strip()

    if not cleaned or len(re.sub(r"\D", "", cleaned)) < 6:
        return None

    try:
        parsed = phonenumbers.parse(cleaned, default_region)
        if phonenumbers.is_valid_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)

        # Parfois le numéro est valide mais "possible" seulement
        if phonenumbers.is_possible_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        pass

    # Fallback : essayer d'autres régions courantes pour ce client
    for region in ["DE", "ES", "IT", "BE", "LU", "NL", "GB", "CH"]:
        if region == default_region:
            continue
        try:
            parsed = phonenumbers.parse(cleaned, region)
            if phonenumbers.is_valid_number(parsed):
                return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except phonenumbers.NumberParseException:
            continue

    return None


def extract_all_phones(client_data: dict) -> list[dict]:
    """Extrait et normalise tous les numéros d'un client Sage."""
    phones = []

    country = (client_data.get("country") or "France").strip()
    region = country_to_region(country)

    # Téléphone principal
    main_phone = normalize_phone(client_data.get("phone"), region)
    if main_phone:
        phones.append({
            "phone_e164": main_phone,
            "raw_phone": client_data.get("phone"),
            "label": "main",
            "source": "sage",
        })

    # Fax (parfois utilisé comme 2e ligne)
    fax = normalize_phone(client_data.get("fax"), region)
    if fax and fax != main_phone:
        phones.append({
            "phone_e164": fax,
            "raw_phone": client_data.get("fax"),
            "label": "fax",
            "source": "sage",
        })

    return phones


def country_to_region(country: str) -> str:
    """Convertit un nom de pays Sage en code région ISO pour phonenumbers."""
    mapping = {
        "france": "FR",
        "allemagne": "DE",
        "espagne": "ES",
        "italie": "IT",
        "belgique": "BE",
        "luxembourg": "LU",
        "pays-bas": "NL",
        "pays bas": "NL",
        "royaume-uni": "GB",
        "suisse": "CH",
        "portugal": "PT",
        "serbie": "RS",
    }
    return mapping.get(country.lower().strip(), "FR")
