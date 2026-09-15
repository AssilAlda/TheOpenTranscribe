import unicodedata


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(char for char in normalized if not unicodedata.combining(char)).casefold()


def clean_transcript(text: str) -> str:
    prompt_variants = {
        normalize_text("Transkribera ordagrant på svenska. Behåll detaljer i talet och hoppa inte över innehåll."),
        normalize_text("Transkribera ordagrant pa svenska. Behall detaljer i talet och hoppa inte over innehall."),
    }

    cleaned_lines = [
        line for line in text.splitlines()
        if normalize_text(line.strip()) not in prompt_variants
    ]

    return "\n".join(cleaned_lines).strip()


def merge_transcript_parts(parts: list[str]) -> str:
    merged_parts: list[str] = []

    for part in parts:
        current = part.strip()
        if not current:
            continue

        if not merged_parts:
            merged_parts.append(current)
            continue

        previous_words = merged_parts[-1].split()
        current_words = current.split()
        best_overlap = 0
        max_overlap = min(40, len(previous_words), len(current_words))

        for overlap_size in range(max_overlap, 4, -1):
            previous_tail = " ".join(previous_words[-overlap_size:])
            current_head = " ".join(current_words[:overlap_size])
            if normalize_text(previous_tail) == normalize_text(current_head):
                best_overlap = overlap_size
                break

        if best_overlap:
            current = " ".join(current_words[best_overlap:]).strip()

        if current:
            merged_parts.append(current)

    return "\n\n".join(merged_parts).strip()
