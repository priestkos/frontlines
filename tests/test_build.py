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

    def test_heading_ids_unique(self):
        blocks, _ = parse("## Sources\n\ntext\n\n## Sources\n\n## Sources\n")
        self.assertEqual([b["id"] for b in blocks if b["type"] == "heading"],
                         ["sources", "sources-2", "sources-3"])

    def test_heading_text_is_plain(self):
        blocks, _ = parse("## Cheng (*cheng* / *ch'i*) & `x`\n")
        self.assertEqual(blocks[0]["text"], "Cheng (cheng / ch'i) & x")

    def test_frontmatter_skipped(self):
        blocks, _ = parse("---\nname: x\n---\nHello\n")
        self.assertEqual(blocks, [{"type": "para", "html": "Hello"}])

    def test_coverage_ignores_fenced_lines(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.md"
            p.write_text("# Title\n\n```\n# macro\n- x\n| a |\n```\n\n- real\n\n|a|\n|-|\n|1|\n",
                         encoding="utf-8")
            _, (r,) = build([p])
        self.assertEqual((r["src_headings"], r["out_headings"]), (1, 1))
        self.assertEqual((r["src_bullets"], r["out_bullets"]), (1, 1))
        self.assertEqual((r["src_table_rows"], r["out_table_rows"]), (1, 1))


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

    def test_no_bare_ampersands(self):
        for name, s in self.markup():
            self.assertEqual(re.findall(r"&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;).{0,20}", s), [], name)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_inline_scripts_parse(self):
        for name, s in self.pages.items():
            for i, js in enumerate(re.findall(r"<script>(.*?)</script>", s, flags=re.S)):
                p = Path(self.tmp.name) / f"{name}-{i}.js"
                p.write_text(js, encoding="utf-8")
                r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, f"{name} script {i}: {r.stderr}")

    def test_ids_unique_and_toc_resolves(self):
        for name, s in self.pages.items():
            ids = re.findall(r'\sid="([^"]+)"', s)
            self.assertEqual(sorted(i for i in set(ids) if ids.count(i) > 1), [], name)
            missing = {h for h in re.findall(r'href="#([^"]+)"', s)} - set(ids)
            self.assertEqual(missing, set(), name)


if __name__ == "__main__":
    unittest.main()
