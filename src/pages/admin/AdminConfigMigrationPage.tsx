import { useRef, useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Alert, Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import AdminRequestState, { getAdminErrorMessage } from '../../components/admin/AdminRequestState';
import { AdminSection, AdminTableFrame } from '../../components/admin/AdminSurface';
import { adminApi } from '../../services/adminApi';

function downloadJsonFile(payload: Record<string, unknown>) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `miragetea-admin-config-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sectionLabel(section: unknown) {
  const key = String(section || '');
  if (key === 'appSettings') return '全局配置';
  if (key === 'platformIntegrations') return '平台集成';
  if (key === 'aiProviders') return 'AI 服务商';
  if (key === 'aiProviderModels') return 'AI 模型';
  if (key === 'plans') return '套餐配置';
  if (key === 'notificationTemplates') return '通知模板';
  return key || '-';
}

export default function AdminConfigMigrationPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [bundle, setBundle] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const exportConfig = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = await adminApi.exportAdminConfig();
      downloadJsonFile(payload);
      setSuccess('配置已导出为 JSON 文件。');
    } catch (exportError) {
      setError(getAdminErrorMessage(exportError));
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (file: File | null) => {
    setError(null);
    setSuccess(null);
    setResult([]);
    setBundle(null);
    setSelectedFileName(file?.name || '');
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('配置文件不是有效 JSON 对象');
        return;
      }
      setBundle(parsed as Record<string, unknown>);
    } catch {
      setError('配置文件解析失败，请确认选择的是导出的 JSON 文件');
    }
  };

  const importConfig = async () => {
    if (!bundle) {
      setError('请先选择配置 JSON 文件');
      return;
    }
    const confirmed = window.confirm('导入会覆盖同编码的全局配置、平台集成、AI 服务商、模型、套餐和通知模板。确认继续？');
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminApi.importAdminConfig(bundle);
      setResult(response.results || []);
      setSuccess('配置导入完成。');
    } catch (importError) {
      setError(getAdminErrorMessage(importError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <AdminSection title="配置迁移" subtitle="导出或导入后台配置，不包含用户列表、订单、额度流水、调用日志和用户创建的 API Key。">
        <Stack spacing={1.5}>
          <Alert severity="warning">
            导出的 JSON 包含支付、短信、邮箱、搜索和 AI 服务商密钥。迁移完成后请按敏感文件处理，不要上传到代码仓库或公开渠道。
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" startIcon={<DownloadIcon />} disabled={loading} onClick={() => void exportConfig()}>
              导出配置 JSON
            </Button>
            <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={loading} onClick={() => inputRef.current?.click()}>
              选择配置文件
            </Button>
            <Button variant="contained" color="warning" disabled={loading || !bundle} onClick={() => void importConfig()}>
              导入并覆盖配置
            </Button>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void loadFile(event.target.files?.[0] || null)}
          />
          {selectedFileName ? (
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
              已选择：{selectedFileName}
            </Typography>
          ) : null}
        </Stack>
      </AdminSection>

      <AdminRequestState loading={loading} error={error} />
      {success ? <Alert severity="success">{success}</Alert> : null}

      <AdminSection title="导入范围" subtitle="同编码记录会更新；不存在的服务商、模型、套餐和通知模板会创建。">
        <Stack spacing={0.75}>
          <Typography variant="body2">包含：全局配置、平台集成配置、AI 服务商配置、AI 模型配置、套餐配置、通知模板。</Typography>
          <Typography variant="body2" color="text.secondary">不包含：普通用户、管理员账号、订单、订阅、支付记录、AI 点数流水、调用日志、用户侧 API Key。</Typography>
        </Stack>
      </AdminSection>

      {result.length ? (
        <AdminSection title="导入结果" bodySx={{ p: 0 }}>
          <AdminTableFrame minWidth={560}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>配置段</TableCell>
                  <TableCell align="right">导入</TableCell>
                  <TableCell align="right">跳过</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.map((row) => (
                  <TableRow key={String(row.section || '')}>
                    <TableCell>{sectionLabel(row.section)}</TableCell>
                    <TableCell align="right">{Number(row.imported || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">{Number(row.skipped || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTableFrame>
        </AdminSection>
      ) : (
        <Box />
      )}
    </Stack>
  );
}
