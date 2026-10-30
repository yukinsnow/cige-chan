# 词格酱 HarmonyOS 原生宿主（实验）

面向 HarmonyOS NEXT / 鸿蒙 5、6 的 ArkUI + ArkWeb HAP 工程，复用仓库 src/ 的本地编辑器。不是 Android APK，也不依赖远程网页。

文件导入、工程/歌词/MIDI 导出通过 ArkTS 的系统文件选择器与文件 API 桥接；背景图片选择使用 Web 文件选择回调。草稿仍保存在应用本地 Web 存储。只申请 INTERNET 权限，供用户主动调用 AI 接口。

构建：使用官方 HarmonyOS 5.1.0.840 Linux Command Line Tools（SDK API 18），JDK 17。先在仓库根目录运行 `node scripts/prepare-harmony.cjs`，然后进入 src-harmony 执行 `ohpm install` 和 `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`。

GitHub Actions 的 HarmonyOS native HAP 工作流下载并校验官方工具链，只上传未签名 HAP，不创建 Release。未签名 HAP 需使用自己的鸿蒙开发者证书及设备授权签名后安装。

目前没有鸿蒙真机测试。首次构建只验证 ArkTS 编译与包内文件；键盘、文件选择、AI 联网、后台草稿恢复和系统确认弹窗仍需真机验收。
