import re
import json
from typing import List, Union

def sentences(text: str) -> List[str]: 
    s = re.split(r"[。.!?]\s+|[\n\r]+", (text or "").strip())
    return [x.strip() for x in s if x.strip()]

def fix_thai_pua(text: str) -> str:
    if not text:
        return ""
    # Mappings from PUA (Private Use Area) legacy font positions to standard Thai Unicode
    pua_map = {
        0xF700: 0x0E34, # ิ
        0xF701: 0x0E35, # ี
        0xF702: 0x0E36, # ึ
        0xF703: 0x0E37, # ื
        0xF704: 0x0E47, # ็
        0xF705: 0x0E48, # ่
        0xF706: 0x0E49, # ้
        0xF707: 0x0E4A, # ๊
        0xF708: 0x0E4B, # ๋
        0xF709: 0x0E4C, # ์
        0xF70A: 0x0E48, # ่ (low)
        0xF70B: 0x0E49, # ้ (low)
        0xF70C: 0x0E4A, # ๊ (low)
        0xF70D: 0x0E4B, # ๋ (low)
        0xF70E: 0x0E4C, # ์ (low)
        0xF710: 0x0E31, # ั
        0xF711: 0x0E34, # ิ (shifted)
        0xF712: 0x0E47, # ็ (shifted)
        0xF713: 0x0E36, # ึ (shifted)
        0xF714: 0x0E37, # ื (shifted)
        0xF715: 0x0E48, # ่ (shifted)
        0xF716: 0x0E49, # ้ (shifted)
        0xF717: 0x0E4A, # ๊ (shifted)
        0xF718: 0x0E4B, # ๋ (shifted)
        0xF719: 0x0E4C, # ์ (shifted)
        0xF71A: 0x0E4C, # ์ (shifted)
    }
    return text.translate(pua_map)

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = fix_thai_pua(text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    return text.strip()

def strip_json_fence(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?", "", s).strip()
        s = re.sub(r"```$", "", s).strip()
    return s

def safe_json_loads(s: str, fallback: Union[dict, list, None] = None):
    try:
        return json.loads(strip_json_fence(s))
    except Exception:
        return fallback if fallback is not None else {}

def numbered_sentences(text: str, max_sentences: int = 800):
    sents = sentences(text)
    sents = sents[:max_sentences]
    return [{"id": i, "text": t} for i, t in enumerate(sents, start=1)]

def truncate_text_chars(text: str, max_chars: int = 45000) -> str:
    text = text or ""
    if len(text) <= max_chars:
        return text  
    else:
        return text[:max_chars]
