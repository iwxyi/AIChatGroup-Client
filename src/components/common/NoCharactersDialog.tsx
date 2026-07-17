import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Stack } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useNavigate } from 'react-router-dom';

interface NoCharactersDialogProps {
  open: boolean;
  onClose: () => void;
  returnTo?: string;
  batchTopic?: string;
  batchDescription?: string;
  title?: string;
  message?: string;
}

function appendQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const trimmed = value?.trim();
    if (trimmed) query.set(key, trimmed);
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export default function NoCharactersDialog({
  open,
  onClose,
  returnTo,
  batchTopic,
  batchDescription,
  title = '还没有角色',
  message = '创建群聊或单聊前，需要先在角色库中创建至少一个角色。也可以根据主题或故事批量生成角色。',
}: NoCharactersDialogProps) {
  const navigate = useNavigate();
  const batchPath = appendQuery('/characters/batch-generate', {
    returnTo,
    topic: batchTopic,
    description: batchDescription,
  });

  const goCharacterLibrary = () => {
    onClose();
    navigate('/characters');
  };

  const goBatchGenerate = () => {
    onClose();
    navigate(batchPath);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<PersonAddIcon />} onClick={goCharacterLibrary}>角色库</Button>
          <Button variant="contained" startIcon={<AutoAwesomeIcon />} onClick={goBatchGenerate}>批量生成</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
