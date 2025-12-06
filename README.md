# Basketball Tactics Board Project

## 项目简介
这是一个基于 React + TypeScript + Konva 的篮球战术板前端项目。

## 快速开始

### 1. 进入前端目录
打开终端，进入 `frontend` 目录：
```bash
cd frontend
```

### 2. 安装依赖
使用 npm 或 yarn 安装项目依赖：
```bash
npm install
# 或者
yarn
```

### 3. 启动开发服务器
```bash
npm run dev
# 或者
yarn dev
```

启动后，打开浏览器访问控制台输出的地址（通常是 http://localhost:5173），即可看到战术板。

## 功能说明
- **球场绘制**: 包含标准篮球场线（中线、三分线、禁区等）。
- **球员交互**: 支持拖拽 10 名球员（5名进攻，5名防守）。

## 下一步开发计划
1. **工具栏开发**: 添加画笔工具（移动路线、传球路线、挡拆符号）。
2. **绘图逻辑**: 实现 `onMouseDown`, `onMouseMove`, `onMouseUp` 事件来绘制线条。
3. **动画回放**: 记录关键帧，实现插值动画。
