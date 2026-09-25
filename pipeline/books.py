"""The permanent book table: one row per book code, in ordinal order.

Ordinals feed the shared verse ID (vid = ord * 2**20 + chapter * 2**10 + verse) and are fixed forever:
new books are appended at the end, never renumbered or reordered. Display order belongs to the canon
profiles, not to ordinals.

Codes are USFM, except ADE (the Additions to Esther as the 1611 KJV numbers them, Esther 10:4-16:24),
which USFM has no code for (its ESG is the whole Greek Esther, a different book).

Per-source names, used by the importers to recognise a source's own book ids:
  app     today's data/ id (the app's book ids, used by compat.py and to migrate saved prefs)
  osis    KJV OSIS book id (also the morphhb/WLC file name for OT books)
  zef     Zefania bname (ASV, YLT)
  tagnt   TAGNT book id (Greek NT)
  father  book name the church-fathers corpus files citations under ("<father> <ch>_<v>.toml")
WEB (USFX) and the eBible DRA (after EBIBLE_TO_USFM) use the USFM code itself.
"""


def B(code, group, app, name, osis=None, zef=None, tagnt=None, father=None):
    return dict(code=code, group=group, app=app, name=name, osis=osis, zef=zef, tagnt=tagnt, father=father)


BOOKS = [
    B('GEN', 'ot', 'gen',    'Genesis',         osis='Gen',    zef='Genesis',         father='Genesis'),
    B('EXO', 'ot', 'exod',   'Exodus',          osis='Exod',   zef='Exodus',          father='Exodus'),
    B('LEV', 'ot', 'lev',    'Leviticus',       osis='Lev',    zef='Leviticus',       father='Leviticus'),
    B('NUM', 'ot', 'num',    'Numbers',         osis='Num',    zef='Numbers',         father='Numbers'),
    B('DEU', 'ot', 'deut',   'Deuteronomy',     osis='Deut',   zef='Deuteronomy',     father='Deuteronomy'),
    B('JOS', 'ot', 'josh',   'Joshua',          osis='Josh',   zef='Joshua',          father='Joshua'),
    B('JDG', 'ot', 'judg',   'Judges',          osis='Judg',   zef='Judges',          father='Judges'),
    B('RUT', 'ot', 'ruth',   'Ruth',            osis='Ruth',   zef='Ruth',            father='Ruth'),
    B('1SA', 'ot', '1sam',   '1 Samuel',        osis='1Sam',   zef='1 Samuel',        father='1 Samuel'),
    B('2SA', 'ot', '2sam',   '2 Samuel',        osis='2Sam',   zef='2 Samuel',        father='2 Samuel'),
    B('1KI', 'ot', '1kgs',   '1 Kings',         osis='1Kgs',   zef='1 Kings',         father='1 Kings'),
    B('2KI', 'ot', '2kgs',   '2 Kings',         osis='2Kgs',   zef='2 Kings',         father='2 Kings'),
    B('1CH', 'ot', '1chr',   '1 Chronicles',    osis='1Chr',   zef='1 Chronicles',    father='1 Chronicles'),
    B('2CH', 'ot', '2chr',   '2 Chronicles',    osis='2Chr',   zef='2 Chronicles',    father='2 Chronicles'),
    B('EZR', 'ot', 'ezra',   'Ezra',            osis='Ezra',   zef='Ezra',            father='Ezra'),
    B('NEH', 'ot', 'neh',    'Nehemiah',        osis='Neh',    zef='Nehemiah',        father='Nehemiah'),
    B('EST', 'ot', 'esth',   'Esther',          osis='Esth',   zef='Esther',          father='Esther'),
    B('JOB', 'ot', 'job',    'Job',             osis='Job',    zef='Job',             father='Job'),
    B('PSA', 'ot', 'ps',     'Psalms',          osis='Ps',     zef='Psalm',           father='Psalms'),
    B('PRO', 'ot', 'prov',   'Proverbs',        osis='Prov',   zef='Proverbs',        father='Proverbs'),
    B('ECC', 'ot', 'eccl',   'Ecclesiastes',    osis='Eccl',   zef='Ecclesiastes',    father='Ecclesiastes'),
    B('SNG', 'ot', 'song',   'Song of Solomon', osis='Song',   zef='Song of Solomon', father='Song of Solomon'),
    B('ISA', 'ot', 'isa',    'Isaiah',          osis='Isa',    zef='Isaiah',          father='Isaiah'),
    B('JER', 'ot', 'jer',    'Jeremiah',        osis='Jer',    zef='Jeremiah',        father='Jeremiah'),
    B('LAM', 'ot', 'lam',    'Lamentations',    osis='Lam',    zef='Lamentations',    father='Lamentations'),
    B('EZK', 'ot', 'ezek',   'Ezekiel',         osis='Ezek',   zef='Ezekiel',         father='Ezekiel'),
    B('DAN', 'ot', 'dan',    'Daniel',          osis='Dan',    zef='Daniel',          father='Daniel'),
    B('HOS', 'ot', 'hos',    'Hosea',           osis='Hos',    zef='Hosea',           father='Hosea'),
    B('JOL', 'ot', 'joel',   'Joel',            osis='Joel',   zef='Joel',            father='Joel'),
    B('AMO', 'ot', 'amos',   'Amos',            osis='Amos',   zef='Amos',            father='Amos'),
    B('OBA', 'ot', 'obad',   'Obadiah',         osis='Obad',   zef='Obadiah',         father='Obadiah'),
    B('JON', 'ot', 'jonah',  'Jonah',           osis='Jonah',  zef='Jonah',           father='Jonah'),
    B('MIC', 'ot', 'mic',    'Micah',           osis='Mic',    zef='Micah',           father='Micah'),
    B('NAM', 'ot', 'nah',    'Nahum',           osis='Nah',    zef='Nahum',           father='Nahum'),
    B('HAB', 'ot', 'hab',    'Habakkuk',        osis='Hab',    zef='Habakkuk',        father='Habakkuk'),
    B('ZEP', 'ot', 'zeph',   'Zephaniah',       osis='Zeph',   zef='Zephaniah',       father='Zephaniah'),
    B('HAG', 'ot', 'hag',    'Haggai',          osis='Hag',    zef='Haggai',          father='Haggai'),
    B('ZEC', 'ot', 'zech',   'Zechariah',       osis='Zech',   zef='Zechariah',       father='Zechariah'),
    B('MAL', 'ot', 'mal',    'Malachi',         osis='Mal',    zef='Malachi',         father='Malachi'),
    B('MAT', 'nt', 'matt',   'Matthew',         osis='Matt',   zef='Matthew',         tagnt='Mat', father='Matthew'),
    B('MRK', 'nt', 'mark',   'Mark',            osis='Mark',   zef='Mark',            tagnt='Mrk', father='Mark'),
    B('LUK', 'nt', 'luke',   'Luke',            osis='Luke',   zef='Luke',            tagnt='Luk', father='Luke'),
    B('JHN', 'nt', 'john',   'John',            osis='John',   zef='John',            tagnt='Jhn', father='John'),
    B('ACT', 'nt', 'acts',   'Acts',            osis='Acts',   zef='Acts',            tagnt='Act', father='Acts'),
    B('ROM', 'nt', 'rom',    'Romans',          osis='Rom',    zef='Romans',          tagnt='Rom', father='Romans'),
    B('1CO', 'nt', '1cor',   '1 Corinthians',   osis='1Cor',   zef='1 Corinthians',   tagnt='1Co', father='1 Corinthians'),
    B('2CO', 'nt', '2cor',   '2 Corinthians',   osis='2Cor',   zef='2 Corinthians',   tagnt='2Co', father='2 Corinthians'),
    B('GAL', 'nt', 'gal',    'Galatians',       osis='Gal',    zef='Galatians',       tagnt='Gal', father='Galatians'),
    B('EPH', 'nt', 'eph',    'Ephesians',       osis='Eph',    zef='Ephesians',       tagnt='Eph', father='Ephesians'),
    B('PHP', 'nt', 'phil',   'Philippians',     osis='Phil',   zef='Philippians',     tagnt='Php', father='Philippians'),
    B('COL', 'nt', 'col',    'Colossians',      osis='Col',    zef='Colossians',      tagnt='Col', father='Colossians'),
    B('1TH', 'nt', '1thess', '1 Thessalonians', osis='1Thess', zef='1 Thessalonians', tagnt='1Th', father='1 Thessalonians'),
    B('2TH', 'nt', '2thess', '2 Thessalonians', osis='2Thess', zef='2 Thessalonians', tagnt='2Th', father='2 Thessalonians'),
    B('1TI', 'nt', '1tim',   '1 Timothy',       osis='1Tim',   zef='1 Timothy',       tagnt='1Ti', father='1 Timothy'),
    B('2TI', 'nt', '2tim',   '2 Timothy',       osis='2Tim',   zef='2 Timothy',       tagnt='2Ti', father='2 Timothy'),
    B('TIT', 'nt', 'titus',  'Titus',           osis='Titus',  zef='Titus',           tagnt='Tit', father='Titus'),
    B('PHM', 'nt', 'phlm',   'Philemon',        osis='Phlm',   zef='Philemon',        tagnt='Phm', father='Philemon'),
    B('HEB', 'nt', 'heb',    'Hebrews',         osis='Heb',    zef='Hebrews',         tagnt='Heb', father='Hebrews'),
    B('JAS', 'nt', 'jas',    'James',           osis='Jas',    zef='James',           tagnt='Jas', father='James'),
    B('1PE', 'nt', '1pet',   '1 Peter',         osis='1Pet',   zef='1 Peter',         tagnt='1Pe', father='1 Peter'),
    B('2PE', 'nt', '2pet',   '2 Peter',         osis='2Pet',   zef='2 Peter',         tagnt='2Pe', father='2 Peter'),
    B('1JN', 'nt', '1jn',    '1 John',          osis='1John',  zef='1 John',          tagnt='1Jn', father='1 John'),
    B('2JN', 'nt', '2jn',    '2 John',          osis='2John',  zef='2 John',          tagnt='2Jn', father='2 John'),
    B('3JN', 'nt', '3jn',    '3 John',          osis='3John',  zef='3 John',          tagnt='3Jn', father='3 John'),
    B('JUD', 'nt', 'jude',   'Jude',            osis='Jude',   zef='Jude',            tagnt='Jud', father='Jude'),
    B('REV', 'nt', 'rev',    'Revelation',      osis='Rev',    zef='Revelation',      tagnt='Rev', father='Revelation'),
    # deuterocanonical books (67+). The corpus files the Additions to Esther under "Esther" (10:4-16:24)
    # and Susanna / Bel under "Daniel" 13 / 14, so ADE has no corpus name of its own.
    B('TOB', 'dc', 'tob',     'Tobit',               osis='Tob',    father='Tobit'),
    B('JDT', 'dc', 'jdt',     'Judith',              osis='Jdt',    father='Judith'),
    B('ADE', 'dc', 'addesth', 'Additions to Esther', osis='EsthGr'),
    B('WIS', 'dc', 'wis',     'Wisdom of Solomon',   osis='Wis',    father='Wisdom'),
    B('SIR', 'dc', 'sir',     'Sirach',              osis='Sir',    father='Sirach'),
    B('BAR', 'dc', 'bar',     'Baruch',              osis='Bar',    father='Baruch'),
    B('LJE', 'dc', None,      'Letter of Jeremiah',  osis='EpJer'),     # today: Baruch 6
    B('S3Y', 'dc', 'prazar',  'Prayer of Azariah',   osis='PrAzar', father='Prayer of Azariah'),
    B('SUS', 'dc', 'sus',     'Susanna',             osis='Sus',    father='Susanna'),
    B('BEL', 'dc', 'bel',     'Bel and the Dragon',  osis='Bel',    father='Bel and the Dragon'),
    B('1MA', 'dc', '1macc',   '1 Maccabees',         osis='1Macc',  father='1 Maccabees'),
    B('2MA', 'dc', '2macc',   '2 Maccabees',         osis='2Macc',  father='2 Maccabees'),
    B('1ES', 'dc', '1esd',    '1 Esdras',            osis='1Esd',   father='1 Esdras'),
    B('2ES', 'dc', '2esd',    '2 Esdras',            osis='2Esd',   father='2 Esdras'),
    B('MAN', 'dc', 'prman',   'Prayer of Manasseh',  osis='PrMan',  father='Prayer of Manasseh'),
    B('ESG', 'dc', None,      'Esther (Greek)'),                        # WEB only; not in today's app
    # append new books here (reserved: PS2 3MA 4MA ODA 4ES ...)
]

for i, b in enumerate(BOOKS, 1):
    b['ord'] = i
BY_CODE = {b['code']: b for b in BOOKS}
BY_APP = {b['app']: b for b in BOOKS if b['app']}
BY_OSIS = {b['osis']: b for b in BOOKS if b['osis']}
BY_ZEF = {b['zef']: b for b in BOOKS if b['zef']}
BY_TAGNT = {b['tagnt']: b for b in BOOKS if b['tagnt']}
BY_FATHER = {b['father']: b for b in BOOKS if b['father']}

# Pinned: changing any of these would renumber every vid built on them.
assert [BY_CODE[c]['ord'] for c in ('GEN', 'MAL', 'MAT', 'REV', 'TOB', 'ESG')] == [1, 39, 40, 66, 67, 82]


def vid(code, ch, v):
    return BY_CODE[code]['ord'] * 2**20 + ch * 2**10 + v
