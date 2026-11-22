# Python cheat sheet

A one-page reminder of everything in the course. Copy, paste, adapt.

## Basics

```python
print("Hello, lab!")          # show something
x = 0.5                       # store a value in a variable
volume_ml = 20                # names: letters, digits, _ ; case matters
# a comment: Python ignores it
```

| Operator | Meaning | Example |
|---|---|---|
| `+ - * /` | arithmetic | `500 / 4` → `125.0` |
| `**` | power | `2 ** 10` → `1024` |
| `//` `%` | whole division, remainder | `100 // 12` → `8`, `100 % 12` → `4` |
| `== != < > <= >=` | compare | `ct < 35` → `True` |
| `and or not` | combine conditions | `od > 0.2 and od < 0.8` |

Types: `int` (96), `float` (0.512), `str` ("ATG"), `bool` (True/False), `None`.
Convert with `int("96")`, `float("0.512")`, `str(3.5)`, `round(3.14159, 2)`. Check with `type(x)`.

## Strings

```python
seq = "ATGGCCATTGTAATG"
len(seq)               # 15
seq[0], seq[-1]        # 'A', 'G'   (positions start at 0)
seq[0:3]               # 'ATG'      (start included, end excluded)
seq[::-1]              # reversed
seq.lower(), seq.upper()
seq.count("G")         # 3
seq.find("ATT")        # 6  (-1 if not found)
seq.replace("T", "U")  # transcription
seq.startswith("ATG")  # True
"a,b,c".split(",")     # ['a', 'b', 'c']
"  0.52\n".strip()     # '0.52'
"-".join(["A", "B"])   # 'A-B'
f"{name}: {gc:.1f} %"  # f-string with 1 decimal
f"{3100000000:,}"      # '3,100,000,000'
```

## Lists

```python
ods = [0.12, 0.25, 0.48]
ods.append(0.91)       # add to the end
ods[0]                 # first item
ods[-1]                # last item
ods[1:3]               # a slice
len(ods), sum(ods), min(ods), max(ods)
sorted(ods)            # new sorted list
sorted(ods, reverse=True)
0.25 in ods            # True
[od * 2 for od in ods]              # list comprehension
[od for od in ods if od > 0.2]      # with a filter
```

Tuples are fixed lists: `pair = ("LMNA_F", "GCTG…")`, unpacked with `name, seq = pair`.

## Dictionaries

```python
conc = {"std_0": 0, "std_250": 250}
conc["std_500"] = 500             # add or change
conc["std_250"]                   # look up (KeyError if missing)
conc.get("std_999", 0)            # look up with a default
"std_0" in conc                   # True
for name, value in conc.items():
    print(name, value)
counts = {}
counts[base] = counts.get(base, 0) + 1     # counting pattern
```

`from collections import Counter` then `Counter("ATGGC")` counts in one line; `.most_common(3)` gives the top 3.

## Loops and conditions

```python
for seq in sequences:
    if len(seq) == 0:
        continue                 # skip to the next one
    elif "N" in seq:
        print("has Ns")
    else:
        print("clean")

for i in range(0, len(seq) - 2, 3):   # every codon start
    codon = seq[i:i + 3]

for i, od in enumerate(ods):          # position and value
    print(i, od)

for t, od in zip(times, ods):         # two lists side by side
    print(t, od)

while od < 0.6:                       # repeat until a condition changes
    od = od * 2
```

Indentation (4 spaces) shows what belongs inside a `for`, `if` or `def`.

## Functions

```python
def gc_content(seq):
    """GC percent of a DNA sequence."""
    seq = seq.upper()
    if not seq:
        return 0.0
    return 100 * (seq.count("G") + seq.count("C")) / len(seq)

def dilute(stock, final, volume=10):    # volume has a default
    return final * volume / stock

dilute(100, 0.5)                        # uses volume=10
dilute(100, 0.5, volume=50)             # keyword argument
```

A function without `return` gives back `None`.

## Files

```python
with open("primers.txt") as f:          # read line by line
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, seq = line.split("\t")

with open("results.txt", "w") as f:     # "w" overwrites, "a" appends
    f.write(f"{name}\t{gc:.1f}\n")

import csv
with open("plate_reader.csv") as f:
    for row in csv.DictReader(f):       # each row is a dictionary
        print(row["well"], float(row["absorbance"]))
```

## Errors

```python
try:
    value = float(text)
except ValueError:
    print(f"Skipping {text!r}")
```

| Error | Usual cause |
|---|---|
| `NameError` | typo in a name, or used before it was created |
| `TypeError` | mixing text and numbers: convert with `float()` |
| `ValueError` | right type, bad value: `float("n/a")` |
| `IndexError` | position past the end of a list |
| `KeyError` | key not in the dictionary: use `.get()` |
| `FileNotFoundError` | wrong file name or wrong folder |
| `ZeroDivisionError` | dividing by an empty count |

Read a traceback from the **bottom**: the last line says what went wrong, the line above says where.

## Common lab snippets

**Read a FASTA file**

```python
def read_fasta(path):
    records, name = {}, None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(">"):
                name = line[1:].split()[0]
                records[name] = ""
            elif name:
                records[name] += line.upper()
    return records
```

**Reverse complement and GC %**

```python
def revcomp(seq):
    pairs = {"A": "T", "T": "A", "G": "C", "C": "G"}
    return "".join(pairs.get(b, "N") for b in seq.upper())[::-1]

def gc_content(seq):
    seq = seq.upper()
    return 100 * (seq.count("G") + seq.count("C")) / len(seq) if seq else 0.0
```

**Read a CSV with pandas**

```python
import pandas as pd
df = pd.read_csv("qpcr.csv")
df.head()                                   # first rows
df["ct"].mean()                             # one column
df[df["gene"] == "LMNA"]                    # filter rows
df.groupby(["condition", "gene"])["ct"].agg(["mean", "std"])
df.to_csv("summary.csv", index=False)       # save
```

**Plot**

```python
import matplotlib.pyplot as plt
plt.plot(df["time_min"], df["WT"], marker="o", label="WT")
plt.yscale("log")
plt.xlabel("time (min)")
plt.ylabel("OD600")
plt.legend()
plt.savefig("growth.png", dpi=200)          # save a file
plt.show()
```

**Fit a straight line (standard curve)**

```python
import numpy as np
slope, intercept = np.polyfit(conc, absorbance, 1)
unknown = (a595 - intercept) / slope
```

## Biopython

```python
from Bio.Seq import Seq
from Bio.SeqUtils import gc_fraction
dna = Seq("ATGGCCTGA")
dna.reverse_complement(); dna.transcribe()
dna.translate(to_stop=True)        # standard code
dna.translate(table=4)             # Mycoplasma: TGA = Trp
gc_fraction(dna) * 100             # GC %
```

```python
from Bio import SeqIO
for rec in SeqIO.parse("sequences.fasta", "fasta"):   # also "fastq", "genbank"
    print(rec.id, len(rec.seq))
first_two = list(SeqIO.parse("sequences.fasta", "fasta"))[:2]
SeqIO.write(first_two, "out.fasta", "fasta")
plasmid = SeqIO.read("pLAB1.gb", "genbank")             # exactly one record
for f in plasmid.features:
    if f.type == "CDS":
        protein = f.extract(plasmid.seq).translate(table=11, to_stop=True)
        print(f.qualifiers["gene"][0], protein[:30])
```

```python
from Bio import Entrez                      # needs internet
Entrez.email = "you@university.edu"         # required by NCBI; max 3 requests/s
ids = Entrez.read(Entrez.esearch(db="nucleotide", term="LMNA[Gene]", retmax=5))["IdList"]
gb = Entrez.efetch(db="nucleotide", id=ids[0], rettype="gb", retmode="text")
```

## Where to go next

- **Install Python on your Mac.** Download the installer from python.org, or `brew install python` if you use Homebrew. Check it in Terminal with `python3 --version`.
- **Run a script in Terminal.** Save your code as `my_tool.py`, open Terminal, `cd` to that folder, and run `python3 my_tool.py`. Add options with argparse: `python3 my_tool.py data.csv --min-gc 50`.
- **Install packages.** Make a project environment once with `python3 -m venv .venv`, activate it with `source .venv/bin/activate`, then `pip install pandas matplotlib`.
- **VS Code.** A free editor with a Python extension: colours, autocompletion, a debugger and a built-in Terminal. Open your project folder and press the Run button.
- **Jupyter.** `pip install jupyterlab`, then `jupyter lab`. Notebooks mix code, plots and notes, which suits exploring a new dataset.
- **More Biopython.** Chapter 11 covers the basics; the free *Biopython Tutorial and Cookbook* (biopython.org) goes on to BLAST, phylogenetics, PDB structures and motifs.
- **Ask Claude.** Describe the files you have and the result you want. Now you can read, check and change the code it writes.
