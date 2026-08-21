/**
 * Removes an exported local-file prefix accidentally persisted before an
 * absolute manual image URL. For example:
 *   ../../../.../https://om.vinfastauto.com/image.png
 */
export function normalizeManualContentHtml(html: string) {
  return html.replace(/(\bsrc\s*=\s*["'])[^"']*?(https?:\/\/[^"']+)(["'])/gi, '$1$2$3')
}
