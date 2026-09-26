// The same observable requirements go to generation and visual review.
const SYMBOL_CONCEPTS = [
  {
    key: "organic_symbol",
    requirement: "ORGANIC CONTOUR: use one flowing asymmetrical outer contour and at most one simple interior cut. Express the subject through silhouette, not literal illustrative detail. No repeated veins, serrated edges, or decorative texture.",
  },
  {
    key: "geometric_symbol",
    requirement: "GEOMETRIC CONSTRUCTION: reduce the subject to two or three visibly geometric planes or arcs with a deliberate angular or symmetric silhouette and one bold negative-space cut. No botanical veins, irregular lobes, serrated edges, hand-drawn organic outline, or realistic illustration. Changing only rotation or layout is not a different concept.",
  },
  {
    key: "negative_space_symbol",
    requirement: "NEGATIVE-SPACE CONSTRUCTION: make the requested subject recognizable primarily through one large interior cutout in a solid silhouette. The cutout, not line detail, must carry the idea. No outlines filled with decorative veins or texture.",
  },
  {
    key: "bold_symbol",
    requirement: "MODULAR CONSTRUCTION: use two or three repeated solid units to form one compact recognizable subject, with a purposeful rhythm or offset. No thin line drawing, realistic illustration, or decorative texture.",
  },
];

function getSymbolConcept(index) {
  return SYMBOL_CONCEPTS[index % SYMBOL_CONCEPTS.length] || SYMBOL_CONCEPTS[0];
}

module.exports = { getSymbolConcept };
