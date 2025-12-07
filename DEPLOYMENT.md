# Vercel 部署配置说明

## 环境变量设置

在 Vercel 项目设置中，需要添加以下环境变量：

### Production Environment Variables

1. **VITE_API_BASE_URL**
   - Value: `https://basketball-tactics-board.onrender.com`
   - Description: 后端API的基础URL

## 重要提示

### Render 免费服务休眠问题

Render的免费服务在15分钟不活动后会自动休眠。首次请求时需要等待30秒左右唤醒服务。

**解决方案：**
- 前端已添加30秒超时和友好的错误提示
- 如果看到"Request timeout - backend may be sleeping"错误，请稍等片刻后重试

### 后端服务检查

访问以下URL检查后端服务状态：
- 主页: https://basketball-tactics-board.onrender.com/
- 健康检查: https://basketball-tactics-board.onrender.com/health

## 本地开发

本地开发时，使用 `.env.development` 配置：
```
VITE_API_BASE_URL=http://localhost:8000
```

启动本地后端：
```bash
cd backend
python main.py
```

## 部署步骤

1. 推送代码到 GitHub
2. Vercel 会自动触发部署
3. 确保环境变量已正确配置
4. 等待构建完成
5. 访问部署后的URL测试功能

## 故障排查

### 如果球员搜索一直加载：

1. **检查后端状态**
   ```bash
   curl https://basketball-tactics-board.onrender.com/health
   ```

2. **查看浏览器控制台**
   - 按 F12 打开开发者工具
   - 查看 Console 标签页的错误信息
   - 查看 Network 标签页的请求详情

3. **常见错误及解决方案**
   - `Failed to fetch`: 后端服务未启动或URL配置错误
   - `CORS error`: 后端CORS配置问题（已在代码中处理）
   - `Timeout`: 后端服务正在唤醒，稍等30秒后重试

### 手动唤醒后端服务

在搜索球员前，先访问：
https://basketball-tactics-board.onrender.com/health

等待响应成功后再使用应用。

## 升级建议

为了避免免费服务的休眠问题，可以考虑：
1. 升级 Render 到付费计划（$7/月起）
2. 使用其他云服务商（AWS Lambda, Google Cloud Run等）
3. 实现后端定时唤醒脚本
