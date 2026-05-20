const { clipboard } = require('electron');
const TextTransform = require('../../utils/text-transform');
const textTransformer = new TextTransform();

function setupTransformIpc(ipcMain, log) {
    ipcMain.handle("list-transforms", async () => {
        return textTransformer.listTransforms();
    });

    ipcMain.handle("apply-transform", async (_, { transformId, text }) => {
        try {
            const result = textTransformer.apply(transformId, text);
            return { success: true, ...result };
        } catch (err) {
            log.error("apply-transform error:", err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle("apply-transform-copy", async (_, { transformId, text }) => {
        try {
            const result = textTransformer.apply(transformId, text);
            clipboard.writeText(result.result);
            return { success: true, label: result.label, result: result.result };
        } catch (err) {
            log.error("apply-transform-copy error:", err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = setupTransformIpc;
