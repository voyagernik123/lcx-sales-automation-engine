/**
 * Component-scoped print stylesheet for the board report.
 *
 * Only mounted by the BoardReport page: hides app chrome (top nav, sidebar,
 * footer) and the page's own controls, unlocks the app's scroll containers so
 * the full report flows across pages, and formats the deck for A4.
 */
export function PrintStyles() {
  const css = `
@media print {
  @page { size: A4; margin: 12mm; }
  header, aside, footer { display: none !important; }
  .br-no-print { display: none !important; }
  html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
  #root .h-screen { height: auto !important; }
  #root .overflow-hidden { overflow: visible !important; }
  main { height: auto !important; overflow: visible !important; padding: 0 !important; }
  .br-page { max-width: none !important; padding: 0 !important; }
  .br-deck { border: none !important; box-shadow: none !important; background: #fff !important; }
  .br-section { break-inside: avoid; }
}
`;
  return <style>{css}</style>;
}
