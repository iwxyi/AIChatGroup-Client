import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

type VipLimitDialogProps = {
  open: boolean;
  title: string;
  description: string;
  current?: number | null;
  limit?: number | null;
  helperText?: string;
  onClose: () => void;
};

export default function VipLimitDialog({ open, title, description, current, limit, helperText, onClose }: VipLimitDialogProps) {
  const navigate = useNavigate();
  const hasProgress = typeof current === 'number' && typeof limit === 'number' && limit > 0;
  const progress = hasProgress ? Math.min(100, Math.max(0, (current / limit) * 100)) : 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <Box sx={{
            width: 38,
            height: 38,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}>
            <WorkspacePremiumIcon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1.25 }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">VIP 权益限制</Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
            {description}
          </Typography>
          {hasProgress ? (
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.25, bgcolor: 'background.default' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
                <Typography variant="caption" color="text.secondary">当前用量</Typography>
                <Typography variant="caption" sx={{ fontWeight: 900 }}>{current}/{limit}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 999 }} />
            </Box>
          ) : null}
          {helperText ? <Typography variant="caption" color="text.secondary">{helperText}</Typography> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose}>稍后再说</Button>
        <Button
          variant="contained"
          onClick={() => {
            onClose();
            navigate('/membership');
          }}
        >
          查看我的 VIP
        </Button>
      </DialogActions>
    </Dialog>
  );
}
