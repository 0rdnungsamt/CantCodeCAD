/* nasjidwg — core document model.
 *
 * A neutral, JSON-friendly representation of a 2D/3D CAD drawing that both
 * the DXF and DWG codecs read into and write from. Every codec-specific
 * detail (group codes, bit layouts) stays inside the codecs; this model is
 * the single language of the library.
 */
export const BY_LAYER = { kind: 'byLayer' };
export const BY_BLOCK = { kind: 'byBlock' };
/** A fresh, valid, empty drawing. */
export const emptyDrawing = () => ({
    header: {},
    layers: [{
            name: '0', color: { kind: 'aci', index: 7 },
            on: true, frozen: false, locked: false
        }],
    linetypes: [{ name: 'Continuous', description: 'Solid line', pattern: [] }],
    textStyles: [{ name: 'Standard' }],
    blocks: {},
    entities: [],
    warnings: []
});
