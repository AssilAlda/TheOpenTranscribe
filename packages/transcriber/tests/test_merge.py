from transcriber.merge import clean_transcript, merge_transcript_parts, normalize_text


def test_normalize_text_strips_diacritics_and_casefolds():
    assert normalize_text("Åre är fantastiskt!") == normalize_text("are ar fantastiskt!")


def test_clean_transcript_removes_echoed_prompt_line():
    text = (
        "Transkribera ordagrant på svenska. Behåll detaljer i talet och hoppa inte över innehåll.\n"
        "Detta är den faktiska transkriberingen."
    )
    assert clean_transcript(text) == "Detta är den faktiska transkriberingen."


def test_clean_transcript_keeps_normal_content_untouched():
    text = "Rad ett.\nRad två."
    assert clean_transcript(text) == "Rad ett.\nRad två."


def test_merge_single_part_returns_it_stripped():
    assert merge_transcript_parts(["  hej och välkommen  "]) == "hej och välkommen"


def test_merge_skips_blank_parts():
    assert merge_transcript_parts(["först", "   ", "sist"]) == "först\n\nsist"


def test_merge_detects_and_removes_exact_five_word_overlap():
    # Regression test: the dedup loop must consider an overlap of exactly 5
    # words, not only 6 or more. `range(max_overlap, 4, -1)` includes 5;
    # the earlier `range(max_overlap, 5, -1)` would have excluded it,
    # silently duplicating the last 5 overlapping words in the merged output.
    previous = "ett två tre fyra fem sex sju åtta nio tio"
    overlapping_tail = "sex sju åtta nio tio"  # exactly 5 words
    current = f"{overlapping_tail} elva tolv"

    merged = merge_transcript_parts([previous, current])

    assert merged == f"{previous}\n\nelva tolv"


def test_merge_does_not_falsely_trim_when_overlap_is_only_four_words():
    # Four words is below the minimum overlap window (range stops before 5),
    # so no trimming should happen even if the words happen to match.
    previous = "ett två tre fyra fem sex sju åtta nio tio"
    current = "sju åtta nio tio elva tolv"

    merged = merge_transcript_parts([previous, current])

    assert merged == f"{previous}\n\n{current}"


def test_merge_prefers_longest_matching_overlap():
    previous = "alfa beta gamma delta epsilon zeta eta theta iota kappa"
    current = "epsilon zeta eta theta iota kappa lambda"

    merged = merge_transcript_parts([previous, current])

    assert merged == f"{previous}\n\nlambda"


def test_merge_with_no_overlap_keeps_both_parts_untouched():
    previous = "detta är det första segmentet i sin helhet"
    current = "detta är ett helt orelaterat andra segment"

    merged = merge_transcript_parts([previous, current])

    assert merged == f"{previous}\n\n{current}"
