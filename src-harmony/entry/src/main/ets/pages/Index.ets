import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { fileIo as fs, picker } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';

interface OpenedText { name: string; contents: string; }
interface FileArgs { defaultName?: string; contents?: string | number[]; }
class FileBridge {
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  constructor(context: common.UIAbilityContext, controller: webview.WebviewController) {
    this.context = context;
    this.controller = controller;
  }
  request(id: string, command: string, json: string): void {
    this.execute(command, json).then((value: string) => this.reply(id, true, value))
      .catch((error: BusinessError) => this.reply(id, false, error.message || '文件操作失败'));
  }
  private reply(id: string, ok: boolean, result: string): void {
    const script = 'window.__cigeNativeReply(' + JSON.stringify(id) + ',' + String(ok) + ',' + JSON.stringify(result) + ')';
    this.controller.runJavaScript(script).catch(() => console.error('Unable to deliver file result'));
  }
  private async execute(command: string, json: string): Promise<string> {
    if (!['save_text', 'save_binary', 'open_text', 'open_binary'].includes(command)) throw new Error('Unsupported file command');
    const args = JSON.parse(json) as FileArgs;
    const documentPicker = new picker.DocumentViewPicker(this.context);
    if (command === 'save_text' || command === 'save_binary') {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [args.defaultName || 'cige-chan.txt'];
      const uris = await documentPicker.save(options);
      if (uris.length === 0) return 'null';
      const data: Uint8Array = command === 'save_text'
        ? new util.TextEncoder().encodeInto(args.contents as string) : new Uint8Array(args.contents as number[]);
      if (data.byteLength > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
      const file = fs.openSync(uris[0], fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      try {
        if (fs.writeSync(file.fd, data.buffer) !== data.byteLength) throw new Error('文件未完整写入');
      } finally { fs.closeSync(file); }
      return JSON.stringify(uris[0]);
    }
    const options = new picker.DocumentSelectOptions();
    options.maxSelectNumber = 1;
    const uris = await documentPicker.select(options);
    if (uris.length === 0) return 'null';
    const file = fs.openSync(uris[0], fs.OpenMode.READ_ONLY);
    let data: Uint8Array;
    try {
      const size = fs.statSync(file.fd).size;
      if (size > 20 * 1024 * 1024) throw new Error('文件不能超过 20 MB');
      const buffer = new ArrayBuffer(size);
      if (fs.readSync(file.fd, buffer) !== size) throw new Error('文件未完整读取');
      data = new Uint8Array(buffer);
    } finally { fs.closeSync(file); }
    if (command === 'open_binary') return JSON.stringify(Array.from(data));
    const text = util.TextDecoder.create('utf-8').decodeToString(data);
    const result: OpenedText = { name: '', contents: text };
    return JSON.stringify(result);
  }
}

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: FileBridge = new FileBridge(getContext(this) as common.UIAbilityContext, this.controller);
  aboutToDisappear(): void { this.controller.deleteJavaScriptRegister('CigeHarmony'); }
  private async selectFile(result: FileSelectorResult): Promise<void> {
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      result.handleFileList(await new picker.DocumentViewPicker(getContext(this) as common.UIAbilityContext).select(options));
    } catch (error) { result.handleFileList([]); }
  }
  build() {
    Column() {
      Web({ src: $rawfile('web/index.html'), controller: this.controller })
        .width('100%').height('100%')
        .javaScriptAccess(true).domStorageAccess(true).databaseAccess(true).fileAccess(true)
        .javaScriptProxy({ object: this.bridge, name: 'CigeHarmony', methodList: ['request'], controller: this.controller })
        .onLoadIntercept((event) => {
          if (!event) return false;
          const url = event.data.getRequestUrl();
          return !url.startsWith('resource://rawfile/') && url !== 'about:blank';
        })
        .onShowFileSelector((event) => { if (event) this.selectFile(event.result); return true; })
        .onConfirm((event) => {
          if (!event) return false;
          AlertDialog.show({ message: event.message,
            primaryButton: { value: '取消', action: () => event.result.handleCancel() },
            secondaryButton: { value: '确定', action: () => event.result.handleConfirm() },
            cancel: () => event.result.handleCancel() });
          return true;
        })
        .onAlert((event) => {
          if (!event) return false;
          AlertDialog.show({ message: event.message,
            confirm: { value: '确定', action: () => event.result.handleConfirm() },
            cancel: () => event.result.handleConfirm() });
          return true;
        })
    }.width('100%').height('100%')
  }
}
