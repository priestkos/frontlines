"""Stdlib tests for the generators: python3 -I -m unittest discover -s tests"""
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
from md2blocks import build, parse  # noqa: E402

# Every element the generators are meant to emit (HTML + inline SVG).
KNOWN_TAGS = set("""a b blockquote body br button canvas circle code div em footer g h1 h2 h3 h4
head header hr html i img input li line main meta nav ol p path pre section span strong svg
table tbody td text th thead title tr ul""".split())


class Parse(unittest.TestCase):
    def test_table_cells_escaped_and_inlined(self):
        blocks, _ = parse("|a|b|\n|-|-|\n|`<se.1>`|**x** & y|\n")
        self.assertEqual(blocks[0]["rows"], [["<code>&lt;se.1&gt;</code>", "<strong>x</strong> &amp; y"]])

    def test_frontmatter_skipped(self):
        blocks, _ = parse("---\nname: x\n---\nHello\n")
        self.assertEqual(blocks, [{"type": "para", "html": "Hello"}])



class BuiltPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        for sub in ("tools", "sources"):
            shutil.copytree(REPO / sub, root / sub)
        cls.pages = {}
        for script, out in (("site_a.py", "woodblock-codex"), ("site_b.py", "plotting-table")):
            subprocess.run([sys.executable, "-I", str(root / "tools" / script)], check=True,
                           capture_output=True)
            cls.pages[out] = (root / out / "index.html").read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def markup(self):
        for name, s in self.pages.items():
            yield name, re.sub(r"<script\b.*?</script>|<style\b.*?</style>", "", s, flags=re.S)

    def test_no_unknown_tags(self):
        for name, s in self.markup():
            tags = {t.lower() for t in re.findall(r"</?([A-Za-z][\w.-]*)", s)}
            self.assertEqual(tags - KNOWN_TAGS, set(), name)



if __name__ == "__main__":
    unittest.main()
