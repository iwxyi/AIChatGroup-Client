import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Collapse, TextField, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import SurfaceCard from '../../components/common/SurfaceCard';
import { transition, motion } from '../../styles/motion';
import type { AppCommandRoute } from '../appCommand/commandTypes';
import { HOME_COMMAND_PLACEHOLDERS } from './placeholders';

type PendingConfirmation = {
  input: string;
  route: AppCommandRoute;
  secrets: Record<string, string>;
  title: string;
  message: string;
};

type CommandFeedback = {
  severity: 'success' | 'info' | 'error';
  title: string;
  message: string;
};

export default function HomeCommandLauncher() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<CommandFeedback | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const preloadedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % HOME_COMMAND_PLACEHOLDERS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  const placeholder = useMemo(() => HOME_COMMAND_PLACEHOLDERS[placeholderIndex], [placeholderIndex]);

  const preload = () => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    void import('./handleHomeCommand');
  };

  const submit = async () => {
    const value = input.trim();
    if (!value || loading) return;
    setLoading(true);
    setFeedback(null);
    setPending(null);
    try {
      const { handleHomeCommand } = await import('./handleHomeCommand');
      const handled = await handleHomeCommand(value, navigate);
      if (handled.result.status === 'needs_confirmation') {
        setPending({
          input: value,
          route: handled.route,
          secrets: handled.secrets,
          title: handled.result.title,
          message: handled.result.message,
        });
      } else {
        setFeedback({ severity: handled.result.status === 'success' ? 'success' : 'info', title: handled.result.title, message: handled.result.message });
        setInput('');
      }
    } catch (error) {
      setFeedback({ severity: 'error', title: '无法执行指令', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!pending || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const { confirmHomeCommand } = await import('./handleHomeCommand');
      const result = await confirmHomeCommand(pending.input, pending.route, pending.secrets, navigate);
      setFeedback({ severity: result.status === 'success' ? 'success' : 'info', title: result.title, message: result.message });
      setPending(null);
      setInput('');
    } catch (error) {
      setFeedback({ severity: 'error', title: '执行失败', message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SurfaceCard
      sx={{
        borderColor: 'divider',
        transition: transition(['border-color', 'box-shadow'], motion.durations.base, motion.gentleSpring),
        '&:focus-within': {
          borderColor: 'primary.main',
          boxShadow: (theme) => theme.palette.mode === 'light' ? '0 18px 42px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.34)',
        },
      }}
    >
      <Box sx={{ display: 'grid', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>你想做什么</Typography>
        </Box>
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
            gap: 1,
            alignItems: 'stretch',
          }}
        >
          <TextField
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={preload}
            placeholder={placeholder}
            size="small"
            fullWidth
            multiline
            minRows={1}
            maxRows={4}
            slotProps={{ htmlInput: { 'aria-label': '自然语言指令' } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !input.trim()}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            sx={{ minWidth: { xs: '100%', sm: 104 } }}
          >
            执行
          </Button>
        </Box>
        <Collapse in={Boolean(pending)}>
          {pending ? (
            <Alert
              severity="info"
              action={(
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" color="inherit" disabled={loading} onClick={() => setPending(null)}>取消</Button>
                  <Button size="small" variant="contained" disabled={loading} onClick={() => void confirm()}>确认</Button>
                </Box>
              )}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{pending.title}</Typography>
              <Typography variant="body2">{pending.message}</Typography>
            </Alert>
          ) : null}
        </Collapse>
        <Collapse in={Boolean(feedback)}>
          {feedback ? (
            <Alert severity={feedback.severity}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{feedback.title}</Typography>
              <Typography variant="body2">{feedback.message}</Typography>
            </Alert>
          ) : null}
        </Collapse>
      </Box>
    </SurfaceCard>
  );
}
