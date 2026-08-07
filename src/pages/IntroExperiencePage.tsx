import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { alpha, type Theme, useTheme } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import HubIcon from '@mui/icons-material/Hub';
import KeyIcon from '@mui/icons-material/Key';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import PsychologyIcon from '@mui/icons-material/Psychology';
import PublicIcon from '@mui/icons-material/Public';
import TimelineIcon from '@mui/icons-material/Timeline';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';

type ScenarioKey = 'pressure' | 'memory' | 'room';

type ThemeTokens = {
  bg: string;
  surface: string;
  paper: string;
  text: string;
  muted: string;
  line: string;
  primary: string;
  secondary: string;
  warning: string;
  darkInk: string;
};

const headingFont = '"Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const monoFont = '"Roboto Mono", "SFMono-Regular", monospace';

const scenarioData: Record<ScenarioKey, {
  label: string;
  eyebrow: string;
  userMessage: string;
  target: string;
  reply: string;
  followUp: string;
  activeLayers: string[];
  readings: Array<{ label: string; value: string }>;
}> = {
  pressure: {
    label: '被当众追问',
    eyebrow: 'ROOM PRESSURE',
    userMessage: '算了，别问了。',
    target: '阿晚',
    reply: '先别围着问。她想说的时候自然会说。',
    followUp: '关系没有被说破，但有人替她把边界挡住了。',
    activeLayers: ['existence', 'identity', 'memory', 'relationship', 'state', 'room', 'intent', 'expression'],
    readings: [
      { label: '房间', value: '多人追问，公开压力升高' },
      { label: '关系', value: '愿意维护，但不替对方作答' },
      { label: '表达', value: '短句、直接、不给私事添细节' },
    ],
  },
  memory: {
    label: '旧事浮现',
    eyebrow: 'MEMORY RECALL',
    userMessage: '今天想喝点清爽的。',
    target: '阿晚',
    reply: '那就别点全糖了。冰一点的柠檬茶，应该更合你。',
    followUp: '旧偏好没有被复述成档案，而是变成了一个自然的建议。',
    activeLayers: ['existence', 'identity', 'memory', 'relationship', 'state', 'intent', 'expression'],
    readings: [
      { label: '记忆', value: '不喜欢太甜的旧偏好被唤醒' },
      { label: '关系', value: '熟悉感允许它多替你想一步' },
      { label: '表达', value: '用建议带出旧事，不宣布“我记得”' },
    ],
  },
  room: {
    label: '房间起冲突',
    eyebrow: 'ROOM DYNAMICS',
    userMessage: '你们先把话说清楚。',
    target: '老李',
    reply: '吵归吵，先别把人也一起推走。把话说完，再决定站哪边。',
    followUp: '角色没有抹平冲突，而是选择先稳住关系的底线。',
    activeLayers: ['existence', 'identity', 'relationship', 'state', 'room', 'intent', 'expression'],
    readings: [
      { label: '房间', value: '主线偏向争执，阵营压力上升' },
      { label: '动机', value: '稳住局面，同时保留自己的立场' },
      { label: '表达', value: '不做总结，给出下一步动作' },
    ],
  },
};

const mindLayers: Array<{
  id: string;
  index: string;
  technical: string;
  title: string;
  description: string;
  tone: 'primary' | 'secondary' | 'warning' | 'neutral';
}> = [
  {
    id: 'existence',
    index: '0',
    technical: 'EXISTENCE BOUNDARY',
    title: '存在边界',
    description: '属于哪个世界，能带着什么继续存在，不假装拥有不属于它的记忆、感知或秘密。',
    tone: 'secondary',
  },
  {
    id: 'identity',
    index: '1',
    technical: 'IDENTITY CORE',
    title: '我是谁',
    description: '身份、性格、说话习惯、价值观、欲望、恐惧与执念。',
    tone: 'primary',
  },
  {
    id: 'memory',
    index: '2',
    technical: 'MEMORY CONTINUITY',
    title: '我记得什么',
    description: '旧事、承诺、禁忌、误会、共同经历和成长节点。',
    tone: 'primary',
  },
  {
    id: 'relationship',
    index: '3',
    technical: 'RELATIONSHIP STANCE',
    title: '我和对方什么关系',
    description: '喜欢、信任、防备、依赖、竞争、亏欠、护短或厌烦。',
    tone: 'warning',
  },
  {
    id: 'state',
    index: '4',
    technical: 'CURRENT STATE',
    title: '我现在什么状态',
    description: '情绪、疲惫、兴奋、压抑、想靠近、想回避或想争回主动权。',
    tone: 'warning',
  },
  {
    id: 'room',
    index: '5',
    technical: 'ROOM DYNAMICS',
    title: '房间正在发生什么',
    description: '主线、矛盾线、阵营压力、话题热度、世界活动和公开边界。',
    tone: 'secondary',
  },
  {
    id: 'intent',
    index: '6',
    technical: 'TURN INTENT',
    title: '我这轮想做什么',
    description: '接住、反驳、追问、打岔、维护、试探、退让、开玩笑或敷衍。',
    tone: 'primary',
  },
  {
    id: 'expression',
    index: '7',
    technical: 'EXPRESSION SHAPE',
    title: '我说出口的，和没说出口的',
    description: '一句、半句、嘴硬、跑题、留白、直说、绕开，或把旧事轻轻提起。',
    tone: 'neutral',
  },
];

const capabilities = [
  {
    id: 'rooms',
    label: 'ROOMS',
    title: '多角色房间',
    description: '创建一个话题，让多个角色在同一段时间里相处。群聊、圆桌、课堂、故事和推理都可以有自己的规则。',
    icon: <ForumOutlinedIcon />,
    lines: ['群聊不是轮流答题', '角色之间会形成主线和余波', '你可以随时介入或改变议题'],
  },
  {
    id: 'continuity',
    label: 'MEMORY & RELATION',
    title: '记忆与关系系统',
    description: '重要经历被整理成关系印象、共同锚点、用户偏好和成长节点，在合适的场景里自然回来。',
    icon: <MemoryIcon />,
    lines: ['记忆按关系与场景分层', '关系变化会留下后效', '公开与私密信息分别投影'],
  },
  {
    id: 'companionship',
    label: 'COMPANIONSHIP',
    title: '一对一私聊与深度陪伴',
    description: '角色可以拥有更细的称呼、习惯、约定和照顾方式。陪伴不必每次都说得很满，也可以落在一个小细节里。',
    icon: <HubIcon />,
    lines: ['用户画像和关系连续性', '共同话语与未完成承诺', '轻量、克制的主动关心'],
  },
  {
    id: 'world',
    label: 'WORLD RUNTIME',
    title: '角色世界与场景扩展',
    description: '朋友圈、活动日历、日记、信件、Agent 任务和世界事件，让角色的经历不只停留在聊天窗口。',
    icon: <AutoGraphIcon />,
    lines: ['事件会回到角色世界', '聊天可以产出可保存的结果', '不同场景共享同一个角色本体'],
  },
];

const channels = [
  {
    name: '公开群聊',
    technical: 'PUBLIC ROOM',
    icon: <PublicIcon />,
    colorKey: 'primary' as const,
    text: '看到公开事件、公开关系和房间态势。',
  },
  {
    name: '用户单聊',
    technical: 'USER DIRECT',
    icon: <PsychologyIcon />,
    colorKey: 'warning' as const,
    text: '保留更细的用户连续性、约定和陪伴细节。',
  },
  {
    name: 'AI 私聊',
    technical: 'PAIR THREAD',
    icon: <LockOutlinedIcon />,
    colorKey: 'secondary' as const,
    text: '角色之间拥有自己的关系、秘密和未完成张力。',
  },
];

function getTokens(theme: Theme): ThemeTokens {
  return {
    bg: theme.palette.background.default,
    surface: theme.palette.surface.main,
    paper: theme.palette.background.paper,
    text: theme.palette.text.primary,
    muted: theme.palette.text.secondary,
    line: theme.palette.divider,
    primary: theme.palette.primary.main,
    secondary: theme.palette.secondary.main,
    warning: theme.palette.warning.main,
    darkInk: theme.palette.mode === 'dark' ? '#06080D' : theme.palette.text.primary,
  };
}

function TechnicalLabel({ children, tokens }: { children: ReactNode; tokens: ThemeTokens }) {
  return (
    <Typography
      sx={{
        color: tokens.primary,
        fontFamily: monoFont,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: 0.95,
        lineHeight: 1.4,
      }}
    >
      {children}
    </Typography>
  );
}

function SectionHeading({
  technical,
  title,
  description,
  tokens,
  light = false,
}: {
  technical: string;
  title: string;
  description: string;
  tokens: ThemeTokens;
  light?: boolean;
}) {
  return (
    <Box sx={{ maxWidth: 760 }}>
      <TechnicalLabel tokens={tokens}>{technical}</TechnicalLabel>
      <Typography
        component="h2"
        sx={{
          mt: 1.2,
          color: light ? '#FFF8EC' : tokens.text,
          fontFamily: headingFont,
          fontSize: { xs: 29, md: 44 },
          fontWeight: 880,
          letterSpacing: 0,
          lineHeight: 1.06,
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          mt: 1.2,
          color: light ? 'rgba(255,248,236,0.68)' : tokens.muted,
          fontSize: { xs: 14, md: 15.5 },
          lineHeight: 1.68,
        }}
      >
        {description}
      </Typography>
    </Box>
  );
}

function HeroRoom({ tokens, reducedMotion, onCreate, onStart }: {
  tokens: ThemeTokens;
  reducedMotion: boolean;
  onCreate: () => void;
  onStart: () => void;
}) {
  const messages = [
    { name: '你', avatar: '/mock-avatars/laoli.png', content: '今晚想喝点清爽的，别太甜。', tone: 'steady' },
    { name: '阿晚', avatar: '/mock-avatars/awan.png', content: '那别点全糖了，你上次半杯都推给我了。', tone: 'soft' },
    { name: '涩涩', avatar: '/mock-avatars/sese.png', content: '他不是怕甜，是怕你又替他做主。', tone: 'sharp' },
    { name: '阿晚', avatar: '/mock-avatars/awan.png', content: '好，那我只建议：冰柠檬茶，少糖。', tone: 'soft' },
  ];

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: { xs: 'auto', md: 660 },
        display: 'grid',
        alignItems: 'center',
        borderBottom: `1px solid ${tokens.line}`,
        backgroundColor: tokens.bg,
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          opacity: 0.34,
          pointerEvents: 'none',
          backgroundImage: `linear-gradient(${alpha(tokens.line, 0.45)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(tokens.line, 0.45)} 1px, transparent 1px)`,
          backgroundSize: '52px 52px',
          maskImage: 'linear-gradient(to bottom, black, transparent 84%)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: '50%',
          bottom: -170,
          width: 620,
          height: 260,
          transform: 'translateX(-50%)',
          borderTop: `1px solid ${alpha(tokens.primary, 0.28)}`,
          borderRadius: '50%',
          pointerEvents: 'none',
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, width: 'min(1240px, calc(100% - 32px))', mx: 'auto', py: { xs: 3.2, md: 6.8 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.8fr 1.2fr' }, gap: { xs: 2.5, lg: 7 }, alignItems: 'center' }}>
          <Box>
            <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.8, mb: { xs: 2, md: 3 } }}>
              {['CHARACTER SYSTEM', '记忆 · 关系 · 场景', 'SENSE MURMUR'].map((label, index) => (
                <Chip
                  key={label}
                  size="small"
                  label={label}
                  variant="outlined"
                  sx={{
                    borderRadius: 1,
                    borderColor: index === 0 ? alpha(tokens.primary, 0.46) : tokens.line,
                    color: index === 0 ? tokens.primary : tokens.muted,
                    fontFamily: index === 0 ? monoFont : undefined,
                    fontSize: 10.5,
                    letterSpacing: index === 0 ? 0.45 : 0,
                    height: 26,
                  }}
                />
              ))}
            </Stack>
            <Typography
              component="h1"
              sx={{
                maxWidth: 690,
                color: tokens.text,
                fontFamily: headingFont,
                fontSize: { xs: 38, sm: 54, md: 66 },
                fontWeight: 880,
                letterSpacing: 0,
                lineHeight: 1.04,
              }}
            >
              让角色同处一场对话，
              <Box component="span" sx={{ display: 'block', color: tokens.primary }}>让关系真正延续。</Box>
            </Typography>
            <Typography sx={{ mt: { xs: 1.3, md: 2 }, maxWidth: 620, color: tokens.muted, fontSize: { xs: 15, md: 17 }, lineHeight: { xs: 1.62, md: 1.72 } }}>
              让角色在相处中，慢慢变成同一个它。它们带着记忆、关系、情绪和自己的边界进入房间，不是轮流答题，而是在时间里留下彼此的影响。
            </Typography>
            <Stack direction="row" spacing={1.2} sx={{ mt: { xs: 2, md: 2.8 }, flexWrap: 'wrap', gap: 1.2 }}>
              <Button
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                onClick={onStart}
                sx={{
                  borderRadius: 1.5,
                  px: 2.2,
                  py: 1.15,
                  bgcolor: tokens.primary,
                  color: tokens.darkInk,
                  fontWeight: 800,
                  '&:hover': { bgcolor: tokens.warning, transform: 'translateY(-2px)' },
                }}
              >
                开始一个房间
              </Button>
              <Button
                variant="outlined"
                startIcon={<PsychologyIcon />}
                onClick={onCreate}
                sx={{
                  borderRadius: 1.5,
                  px: 2.1,
                  py: 1.15,
                  color: tokens.text,
                  borderColor: tokens.line,
                  '&:hover': { borderColor: tokens.primary, bgcolor: alpha(tokens.primary, 0.08) },
                }}
              >
                创建角色
              </Button>
            </Stack>
          </Box>

            <Box
              sx={{
                position: 'relative',
                minHeight: { xs: 238, sm: 330, lg: 460 },
                border: `1px solid ${alpha(tokens.primary, 0.28)}`,
                backgroundColor: alpha(tokens.surface, 0.82),
              boxShadow: `0 28px 80px ${alpha('#000000', 0.22)}`,
              overflow: 'hidden',
              animation: reducedMotion ? 'none' : 'introStageBreath 8s ease-in-out infinite',
            }}
          >
            <Box sx={{ px: { xs: 1.6, sm: 2.2 }, py: 1.35, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${tokens.line}`, backgroundColor: alpha(tokens.paper, 0.18) }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.primary, boxShadow: `0 0 0 4px ${alpha(tokens.primary, 0.14)}` }} />
                <Typography sx={{ color: tokens.text, fontWeight: 800, fontSize: 13 }}>深夜房间 / 4 人在线</Typography>
              </Stack>
              <Typography sx={{ color: tokens.muted, fontFamily: monoFont, fontSize: 10.5 }}>LIVE THREAD</Typography>
            </Box>
            <Box sx={{ px: { xs: 1.5, sm: 2.2 }, py: 1.05, height: { xs: 162, sm: 272, lg: 352 }, display: 'grid', alignContent: 'end', gap: 0.95, overflow: 'hidden' }}>
              {messages.map((message, index) => (
                <Box
                  key={`${message.name}-${index}`}
                  sx={{
                    display: { xs: index === 0 ? 'none' : 'grid', sm: 'grid' },
                    gridTemplateColumns: '30px minmax(0, 1fr)',
                    gap: 1,
                    alignItems: 'start',
                    animation: reducedMotion ? 'none' : `introMessageIn 560ms cubic-bezier(0.2, 0.8, 0.2, 1) ${index * 170}ms both`,
                  }}
                >
                  <Box component="img" src={message.avatar} alt="" sx={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${alpha(tokens.primary, 0.35)}` }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: tokens.muted, fontSize: 11.5, mb: 0.25 }}>{message.name}</Typography>
                    <Box sx={{ width: 'fit-content', maxWidth: '100%', px: 1.1, py: 0.85, border: `1px solid ${message.tone === 'sharp' ? alpha(tokens.warning, 0.42) : alpha(tokens.line, 0.9)}`, borderRadius: message.tone === 'sharp' ? '4px 12px 12px 12px' : '12px 12px 12px 4px', bgcolor: message.tone === 'sharp' ? alpha(tokens.warning, 0.12) : alpha(tokens.paper, 0.34), color: tokens.text, fontSize: 14.5, lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {message.content}
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ px: { xs: 1.5, sm: 2.2 }, py: 1.05, borderTop: `1px solid ${tokens.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ color: tokens.muted, fontFamily: monoFont, fontSize: 10.5 }}>00:42</Typography>
              <TimelineIcon sx={{ color: tokens.primary, fontSize: 20 }} />
            </Box>
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', color: tokens.muted, fontFamily: monoFont, fontSize: 10, letterSpacing: 0.9, whiteSpace: 'nowrap' }}>
        SCROLL TO SEE THE ROLE TAKE SHAPE
      </Box>
    </Box>
  );
}

function PainSection({ tokens }: { tokens: ThemeTokens }) {
  const pains = [
    ['聊了很久，下次见面却像第一次认识。', '角色不会只保存最近几句话。'],
    ['创建了不同角色，最后都说成同一种话。', '每个角色都有自己的来处和关系位置。'],
    ['放进群聊以后，只剩轮流回答和彼此附和。', '房间会形成主线、压力和自己的气氛。'],
  ];

  return (
    <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 6.5, md: 9.5 } }}>
      <SectionHeading
        technical="WHY IT FEELS EMPTY"
        title="普通 AI 聊天，最容易坏在这些地方。"
        description="生息解决的，不是怎样生成更长的回答，而是怎样让角色带着过去，继续留在这个房间里。"
        tokens={tokens}
      />
      <Box sx={{ mt: 4.4, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, borderTop: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
        {pains.map(([pain, answer], index) => (
          <Box key={pain} sx={{ p: { xs: 2, md: 2.4 }, borderRight: { md: index < pains.length - 1 ? `1px solid ${tokens.line}` : 'none' }, borderBottom: { xs: index < pains.length - 1 ? `1px solid ${tokens.line}` : 'none', md: 'none' } }}>
            <Typography sx={{ color: tokens.text, fontFamily: headingFont, fontSize: { xs: 20, md: 22 }, fontWeight: 850, lineHeight: 1.3 }}>{pain}</Typography>
            <Typography sx={{ mt: 1.05, color: tokens.primary, fontSize: 13.2, lineHeight: 1.6 }}>{answer}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function MindProjectionSection({ tokens, reducedMotion }: { tokens: ThemeTokens; reducedMotion: boolean }) {
  const [scenario, setScenario] = useState<ScenarioKey>('pressure');
  const [selectedLayer, setSelectedLayer] = useState('expression');
  const activeScenario = scenarioData[scenario];
  const selectedLayerData = mindLayers.find((layer) => layer.id === selectedLayer) ?? mindLayers[mindLayers.length - 1];

  const toneColor = (tone: (typeof mindLayers)[number]['tone']) => {
    if (tone === 'secondary') return tokens.secondary;
    if (tone === 'warning') return tokens.warning;
    if (tone === 'neutral') return tokens.muted;
    return tokens.primary;
  };

  return (
    <Box sx={{ py: { xs: 6.5, md: 10.5 }, backgroundColor: tokens.darkInk, color: '#FFF8EC', borderTop: `1px solid ${alpha(tokens.primary, 0.22)}`, borderBottom: `1px solid ${alpha(tokens.primary, 0.22)}` }}>
      <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto' }}>
        <SectionHeading
          technical="CHARACTER MIND PROJECTION / 角色心智投影"
          title="一句话出现之前，先有一个完整的“此刻的它”。"
          description="每轮对话前，角色的身份、记忆、关系、状态、房间处境和表达倾向会重新汇成一份当前心智。"
          tokens={tokens}
          light
        />
        <Box sx={{ mt: 4.4, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.04fr 0.96fr' }, gap: { xs: 3.4, lg: 6 }, alignItems: 'start' }}>
          <Box>
            <Box sx={{ display: 'grid', gap: 0.55, alignItems: 'end' }}>
              {mindLayers.map((layer, index) => {
                const active = activeScenario.activeLayers.includes(layer.id);
                const selected = selectedLayer === layer.id;
                const width = `${100 - index * 7}%`;
                const color = toneColor(layer.tone);
                return (
                  <Box
                    key={layer.id}
                    component="button"
                    type="button"
                    onClick={() => setSelectedLayer(layer.id)}
                    onMouseEnter={() => setSelectedLayer(layer.id)}
                    onFocus={() => setSelectedLayer(layer.id)}
                    sx={{
                      width,
                      minHeight: { xs: 60, sm: 66 },
                      mx: 'auto',
                      p: { xs: 1, sm: 1.2 },
                      textAlign: 'left',
                      color: '#FFF8EC',
                      border: `1px solid ${active || selected ? alpha(color, selected ? 0.9 : 0.48) : 'rgba(255,248,236,0.13)'}`,
                      backgroundColor: active ? alpha(color, selected ? 0.18 : 0.09) : 'rgba(255,248,236,0.035)',
                      clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0 100%)',
                      cursor: 'pointer',
                      transition: reducedMotion ? 'none' : 'background-color 260ms ease, border-color 260ms ease, transform 260ms ease',
                      transform: selected && !reducedMotion ? 'translateX(5px)' : 'none',
                      '&:hover, &:focus-visible': { outline: 'none', backgroundColor: alpha(color, 0.18), borderColor: alpha(color, 0.9) },
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ flexShrink: 0, color, fontFamily: monoFont, fontSize: 10.5, fontWeight: 800 }}>{layer.index}</Typography>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: { xs: 14, sm: 15 }, fontWeight: 850, lineHeight: 1.25 }}>{layer.title}</Typography>
                        <Typography sx={{ mt: 0.2, color: 'rgba(255,248,236,0.52)', fontFamily: monoFont, fontSize: { xs: 8.5, sm: 9.5 }, letterSpacing: 0.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{layer.technical}</Typography>
                      </Box>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
            <Typography sx={{ mt: 1.35, color: 'rgba(255,248,236,0.46)', fontSize: 11.5, textAlign: 'center', lineHeight: 1.55 }}>
              外部情境场持续影响所有层：当前话题、房间压力、主线、矛盾和公开边界。
            </Typography>
            <Box
              key={selectedLayerData.id}
              sx={{
                mt: 1.4,
                mx: 'auto',
                width: 'min(520px, 100%)',
                p: { xs: 1.35, sm: 1.55 },
                border: `1px solid ${alpha(toneColor(selectedLayerData.tone), 0.42)}`,
                bgcolor: alpha(toneColor(selectedLayerData.tone), 0.08),
                animation: reducedMotion ? 'none' : 'introReplyIn 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }}>
                <Typography sx={{ color: toneColor(selectedLayerData.tone), fontFamily: monoFont, fontSize: 10.5, fontWeight: 850 }}>{selectedLayerData.index}</Typography>
                <Typography sx={{ color: '#FFF8EC', fontSize: 16, fontWeight: 850, lineHeight: 1.25 }}>{selectedLayerData.title}</Typography>
                <Typography sx={{ color: 'rgba(255,248,236,0.44)', fontFamily: monoFont, fontSize: 9.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedLayerData.technical}</Typography>
              </Stack>
              <Typography sx={{ mt: 0.7, color: 'rgba(255,248,236,0.7)', fontSize: 13.2, lineHeight: 1.55 }}>
                {selectedLayerData.description}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ position: 'sticky', top: 92 }}>
            <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.8 }}>
              {(Object.keys(scenarioData) as ScenarioKey[]).map((key) => (
                <Button
                  key={key}
                  size="small"
                  onClick={() => {
                    setScenario(key);
                    setSelectedLayer('expression');
                  }}
                  sx={{
                    borderRadius: 1,
                    px: 1.1,
                    color: scenario === key ? tokens.darkInk : 'rgba(255,248,236,0.72)',
                    bgcolor: scenario === key ? tokens.primary : 'rgba(255,248,236,0.08)',
                    border: `1px solid ${scenario === key ? tokens.primary : 'rgba(255,248,236,0.14)'}`,
                    '&:hover': { bgcolor: scenario === key ? tokens.warning : 'rgba(255,248,236,0.14)' },
                  }}
                >
                  {scenarioData[key].label}
                </Button>
              ))}
            </Stack>
            <Box sx={{ mt: 1.6, p: { xs: 1.8, sm: 2.2 }, border: `1px solid ${alpha(tokens.primary, 0.34)}`, backgroundColor: 'rgba(255,248,236,0.055)' }}>
              <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8 }}>{activeScenario.eyebrow}</Typography>
              <Typography sx={{ mt: 1.2, color: 'rgba(255,248,236,0.58)', fontSize: 12 }}>用户</Typography>
              <Typography sx={{ mt: 0.3, color: '#FFF8EC', fontSize: { xs: 17, sm: 19 }, fontWeight: 800, lineHeight: 1.35 }}>“{activeScenario.userMessage}”</Typography>
              <Divider sx={{ my: 1.25, borderColor: 'rgba(255,248,236,0.12)' }} />
              <Typography sx={{ color: 'rgba(255,248,236,0.58)', fontSize: 12 }}>{activeScenario.target}</Typography>
              <Typography
                key={`${scenario}-${selectedLayer}`}
                sx={{
                  mt: 0.35,
                  color: '#FFF8EC',
                  fontFamily: headingFont,
                  fontSize: { xs: 21, sm: 25 },
                  fontWeight: 860,
                  lineHeight: 1.3,
                  animation: reducedMotion ? 'none' : 'introReplyIn 440ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
                }}
              >
                “{activeScenario.reply}”
              </Typography>
              <Typography sx={{ mt: 1.15, color: 'rgba(255,248,236,0.58)', fontSize: 12.5, lineHeight: 1.6 }}>{activeScenario.followUp}</Typography>
              <Box sx={{ mt: 1.45, p: 1.2, borderLeft: `2px solid ${toneColor(selectedLayerData.tone)}`, bgcolor: alpha(toneColor(selectedLayerData.tone), 0.08) }}>
                <Typography sx={{ color: toneColor(selectedLayerData.tone), fontFamily: monoFont, fontSize: 9.5, fontWeight: 850, lineHeight: 1.3 }}>ACTIVE LAYER</Typography>
                <Typography sx={{ mt: 0.35, color: 'rgba(255,248,236,0.78)', fontSize: 13, lineHeight: 1.5 }}>
                  {selectedLayerData.title}正在决定它注意什么、避开什么，以及这句话该不该说满。
                </Typography>
              </Box>
              <Stack spacing={0.75} sx={{ mt: 1.7 }}>
                {activeScenario.readings.map((reading) => (
                  <Box key={reading.label} sx={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: 1, alignItems: 'baseline' }}>
                    <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 10, fontWeight: 800 }}>{reading.label}</Typography>
                    <Typography sx={{ color: 'rgba(255,248,236,0.74)', fontSize: 12.5, lineHeight: 1.5 }}>{reading.value}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
            <Typography sx={{ mt: 1.15, color: 'rgba(255,248,236,0.42)', fontSize: 11.25, lineHeight: 1.5 }}>
              点击或移动到不同层，查看它如何改变这一轮的注意力和表达。
            </Typography>
          </Box>
        </Box>
      </Box>
      <style>{`
        @keyframes introReplyIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Box>
  );
}

function MemoryChart({ tokens }: { tokens: ThemeTokens }) {
  const events = [
    { date: '03.12', label: '不喜欢太甜', detail: '一句随口偏好', color: tokens.warning },
    { date: '03.19', label: '被阿晚记住', detail: '关系里的照顾方式', color: tokens.primary },
    { date: '04.02', label: '半杯推给她', detail: '变成共同玩笑', color: tokens.secondary },
    { date: '04.18', label: '少糖柠檬茶', detail: '自然回到建议里', color: tokens.primary },
  ];

  return (
    <Box sx={{ mt: 3.2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '0.92fr 42px 1fr' },
          gap: { xs: 1.2, sm: 1.6 },
          alignItems: 'center',
          mb: 2.4,
        }}
      >
        <Box sx={{ p: 1.45, border: `1px solid ${alpha(tokens.warning, 0.38)}`, bgcolor: alpha(tokens.warning, 0.08) }}>
          <Typography sx={{ color: tokens.warning, fontFamily: monoFont, fontSize: 10, fontWeight: 850 }}>OLD LINE</Typography>
          <Typography sx={{ mt: 0.5, color: tokens.text, fontSize: 17, fontWeight: 850, lineHeight: 1.28 }}>“别太甜，我喝不了。”</Typography>
          <Typography sx={{ mt: 0.55, color: tokens.muted, fontSize: 12.5, lineHeight: 1.5 }}>不是关键词收藏，而是一次偏好、语气和场景的共同记录。</Typography>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'grid' }, placeItems: 'center', color: tokens.primary }}>
          <ArrowForwardIcon />
        </Box>
        <Box sx={{ p: 1.45, border: `1px solid ${alpha(tokens.primary, 0.42)}`, bgcolor: alpha(tokens.primary, 0.08) }}>
          <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 10, fontWeight: 850 }}>NEXT TURN</Typography>
          <Typography sx={{ mt: 0.5, color: tokens.text, fontSize: 17, fontWeight: 850, lineHeight: 1.28 }}>“那就少糖，冰一点。”</Typography>
          <Typography sx={{ mt: 0.55, color: tokens.muted, fontSize: 12.5, lineHeight: 1.5 }}>旧事没有被背诵出来，而是改变了角色替你考虑的方式。</Typography>
        </Box>
      </Box>
      <Box
        sx={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' },
          gap: { xs: 0, md: 1.25 },
          pt: { xs: 0, md: 2.4 },
          pb: { xs: 0, md: 1 },
          '&::before': {
            content: '""',
            position: 'absolute',
            left: { xs: 6, md: 28 },
            top: { xs: 0, md: 50 },
            bottom: { xs: 0, md: 'auto' },
            right: { xs: 'auto', md: 28 },
            width: { xs: 1, md: 'auto' },
            height: { xs: 'auto', md: 1 },
            bgcolor: tokens.line,
          },
        }}
      >
        {events.map((event, index) => (
          <Box
            key={event.label}
            sx={{
              position: 'relative',
              display: { xs: 'grid', md: 'block' },
              gridTemplateColumns: { xs: '24px minmax(0, 1fr)', md: 'none' },
              columnGap: 1.2,
              pb: { xs: index < events.length - 1 ? 1.9 : 0, md: 0 },
            }}
          >
            <Box
              sx={{
                width: 13,
                height: 13,
                mt: { xs: 0.45, md: 0 },
                justifySelf: { xs: 'center', md: index === 0 ? 'start' : 'center' },
                borderRadius: '50%',
                bgcolor: event.color,
                border: `3px solid ${tokens.bg}`,
                boxShadow: `0 0 0 1px ${alpha(event.color, 0.55)}, 0 0 20px ${alpha(event.color, 0.28)}`,
                zIndex: 1,
              }}
            />
            <Box sx={{ gridColumn: { xs: 2, md: 'auto' } }}>
              <Typography sx={{ mt: { xs: 0, md: 1.5 }, color: event.color, fontFamily: monoFont, fontSize: 10, fontWeight: 800 }}>{event.date}</Typography>
              <Typography sx={{ mt: 0.4, color: tokens.text, fontSize: 15.5, fontWeight: 800 }}>{event.label}</Typography>
              <Typography sx={{ mt: 0.3, color: tokens.muted, fontSize: 12.2, lineHeight: 1.45 }}>{event.detail}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function RelationshipGraph({ tokens }: { tokens: ThemeTokens }) {
  const edges = [
    ['用户', '阿晚', '熟悉 / 维护', tokens.primary],
    ['老李', '阿晚', '竞争 / 试探', tokens.warning],
    ['涩涩', '阿晚', '共同经历', tokens.secondary],
    ['房间', '阿晚', '公开态势', tokens.primary],
  ];

  return (
    <Box sx={{ mt: 2.6, borderTop: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0 }}>
        {edges.map(([from, to, stance, color], index) => (
          <Box
            key={`${from}-${stance}`}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '56px minmax(0, 1fr)', sm: '58px minmax(0, 1fr) 52px' },
              gap: 1.1,
              alignItems: 'center',
              minHeight: 58,
              px: 0.2,
              borderBottom: index < edges.length - 1 ? `1px solid ${tokens.line}` : 'none',
            }}
          >
            <Typography sx={{ color: tokens.text, fontSize: 14, fontWeight: 850 }}>{from}</Typography>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ height: 4, borderRadius: 999, bgcolor: alpha(String(color), 0.16), overflow: 'hidden' }}>
                <Box sx={{ width: index === 1 ? '62%' : index === 3 ? '72%' : '86%', height: '100%', bgcolor: String(color), opacity: 0.86 }} />
              </Box>
              <Typography sx={{ mt: 0.55, color: tokens.muted, fontSize: 12.5, lineHeight: 1.35 }}>{stance}</Typography>
            </Box>
            <Typography sx={{ display: { xs: 'none', sm: 'block' }, color: tokens.text, fontSize: 14, fontWeight: 850, textAlign: 'right' }}>{to}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 1.3, mb: 1.4, p: 1.35, border: `1px solid ${alpha(tokens.primary, 0.34)}`, bgcolor: alpha(tokens.primary, 0.075) }}>
        <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 10, fontWeight: 850 }}>RELATIONSHIP EFFECT</Typography>
        <Typography sx={{ mt: 0.45, color: tokens.text, fontSize: 14, lineHeight: 1.55 }}>
          同一句话，面对用户会更照顾边界；面对老李会带一点试探；在公开房间里又会收住私密细节。
        </Typography>
      </Box>
    </Box>
  );
}

function ContinuitySection({ tokens }: { tokens: ThemeTokens }) {
  const darkTokens: ThemeTokens = {
    ...tokens,
    bg: '#101723',
    surface: '#141C2A',
    paper: '#182131',
    text: '#FFF8EC',
    muted: 'rgba(255,248,236,0.66)',
    line: 'rgba(255,248,236,0.14)',
    darkInk: '#101723',
  };

  return (
        <Box sx={{ backgroundColor: darkTokens.bg, borderBottom: `1px solid ${alpha(tokens.primary, 0.22)}` }}>
      <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 6.5, md: 9 } }}>
        <SectionHeading
          technical="MEMORY LIFECYCLE / RELATIONSHIP LEDGER"
          title="经历不会停在消息里。"
          description="一次偏好、一次维护、一个共同玩笑，都会成为下一次相处的来处。"
          tokens={darkTokens}
          light
        />
        <Box sx={{ mt: 4.2, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '1.12fr 0.88fr' }, gap: { xs: 3.5, lg: 5.2 }, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TimelineIcon sx={{ color: darkTokens.primary }} />
            <Typography sx={{ color: darkTokens.text, fontSize: 18, fontWeight: 850 }}>Memory Lifecycle · 记忆生命周期</Typography>
          </Stack>
          <Typography sx={{ mt: 0.9, color: darkTokens.muted, fontSize: 13.5, lineHeight: 1.62 }}>重要经历被整理、沉淀，并在合适的场景被自然唤醒。</Typography>
          <MemoryChart tokens={darkTokens} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <HubIcon sx={{ color: darkTokens.warning }} />
            <Typography sx={{ color: darkTokens.text, fontSize: 18, fontWeight: 850 }}>Relationship Ledger · 关系账本</Typography>
          </Stack>
          <Typography sx={{ mt: 0.9, color: darkTokens.muted, fontSize: 13.5, lineHeight: 1.62 }}>关系不是一个分数，而是角色对不同对象的行为偏置。</Typography>
          <RelationshipGraph tokens={darkTokens} />
        </Box>
        </Box>
      </Box>
    </Box>
  );
}

function ChannelSection({ tokens }: { tokens: ThemeTokens }) {
  const [active, setActive] = useState(0);
  const activeChannel = channels[active];
  const color = tokens[activeChannel.colorKey];

  return (
    <Box sx={{ backgroundColor: alpha(tokens.surface, 0.44), borderTop: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
      <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 6.5, md: 9.5 } }}>
        <SectionHeading
          technical="CHANNEL PROJECTION"
          title="同一个角色，不同的可见世界。"
          description="群聊、用户单聊和 AI 私聊共享同一个角色本体，但每个场景都有自己的边界和关系细节。"
          tokens={tokens}
        />
        <Box sx={{ mt: 4.2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.78fr 1.22fr' }, gap: { xs: 2.8, md: 4.4 }, alignItems: 'stretch' }}>
          <Stack spacing={0.8}>
            {channels.map((channel, index) => {
              const selected = index === active;
              const channelColor = tokens[channel.colorKey];
              return (
                <Button
                  key={channel.name}
                  onClick={() => setActive(index)}
                  startIcon={channel.icon}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    minHeight: 64,
                    px: 1.45,
                    borderRadius: 1,
                    color: selected ? tokens.text : tokens.muted,
                    border: `1px solid ${selected ? alpha(channelColor, 0.65) : tokens.line}`,
                    backgroundColor: selected ? alpha(channelColor, 0.1) : 'transparent',
                    '&:hover': { backgroundColor: alpha(channelColor, 0.1), borderColor: alpha(channelColor, 0.6) },
                    '& .MuiButton-startIcon': { color: channelColor },
                  }}
                >
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 850, lineHeight: 1.2 }}>{channel.name}</Typography>
                    <Typography sx={{ mt: 0.2, color: selected ? alpha(tokens.text, 0.68) : tokens.muted, fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5 }}>{channel.technical}</Typography>
                  </Box>
                </Button>
              );
            })}
          </Stack>
          <Box sx={{ minHeight: 248, p: { xs: 2, md: 2.7 }, border: `1px solid ${alpha(color, 0.45)}`, backgroundColor: alpha(tokens.paper, 0.22), position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', right: 20, top: 20, width: 96, height: 96, border: `1px solid ${alpha(color, 0.34)}`, borderRadius: '50%' }} />
            <Box sx={{ position: 'absolute', right: 49, top: 49, width: 34, height: 34, border: `1px solid ${alpha(color, 0.55)}`, borderRadius: '50%', backgroundColor: alpha(color, 0.1) }} />
            <Box sx={{ position: 'relative', zIndex: 1 }}>
              <Typography sx={{ color, fontFamily: monoFont, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8 }}>{activeChannel.technical}</Typography>
              <Typography sx={{ mt: 1.2, color: tokens.text, fontFamily: headingFont, fontSize: { xs: 24, md: 30 }, fontWeight: 880 }}>{activeChannel.name}</Typography>
              <Typography sx={{ mt: 0.95, maxWidth: 520, color: tokens.muted, fontSize: 14.5, lineHeight: 1.68 }}>{activeChannel.text}</Typography>
              <Divider sx={{ my: 1.8, borderColor: tokens.line }} />
              <Stack spacing={0.8}>
                {[
                  `${activeChannel.name} · ${activeChannel.technical}`,
                  activeChannel.text,
                  '同一个角色本体，按场景投影不同细节。',
                ].map((line, index) => (
                  <Stack key={line} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ width: 8.5, height: 8.5, mt: 0.65, borderRadius: '50%', bgcolor: index === 0 ? color : alpha(color, 0.55), boxShadow: index === 0 ? `0 0 0 4px ${alpha(color, 0.12)}` : 'none' }} />
                    <Typography sx={{ color: index === 2 ? tokens.text : tokens.muted, fontSize: 13.2, lineHeight: 1.52 }}>{line}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function CapabilitySection({ tokens }: { tokens: ThemeTokens }) {
  const [active, setActive] = useState(0);
  const capability = capabilities[active];

  return (
    <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 6.5, md: 9.5 } }}>
      <SectionHeading
        technical="WORLD RUNTIME"
        title="不只是聊天框，而是一套角色运行系统。"
        description="从房间、记忆、陪伴到 Agent 和活动，角色的经历可以继续延展，也可以被你掌控。"
        tokens={tokens}
      />
      <Box sx={{ mt: 4.2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 0, borderTop: `1px solid ${tokens.line}`, borderBottom: `1px solid ${tokens.line}` }}>
        {capabilities.map((item, index) => {
          const selected = index === active;
          return (
            <Button
              key={item.id}
              onClick={() => setActive(index)}
              startIcon={item.icon}
              sx={{
                minHeight: { xs: 78, md: 142 },
                justifyContent: { xs: 'flex-start', md: 'center' },
                alignItems: { xs: 'center', md: 'flex-start' },
                flexDirection: { xs: 'row', md: 'column' },
                gap: { md: 1.1 },
                borderRadius: 0,
                borderRight: { md: index < capabilities.length - 1 ? `1px solid ${tokens.line}` : 'none' },
                borderBottom: { xs: index < capabilities.length - 1 ? `1px solid ${tokens.line}` : 'none', md: 'none' },
                color: selected ? tokens.text : tokens.muted,
                backgroundColor: selected ? alpha(tokens.primary, 0.09) : 'transparent',
                '&:hover': { backgroundColor: alpha(tokens.primary, 0.08), color: tokens.text },
                '& .MuiButton-startIcon': { color: selected ? tokens.primary : tokens.muted, mr: { xs: 1, md: 0 } },
              }}
              >
                <Box sx={{ textAlign: { xs: 'left', md: 'center' } }}>
                <Typography sx={{ fontSize: 15, fontWeight: 850, lineHeight: 1.2 }}>{item.title}</Typography>
                <Typography sx={{ mt: 0.3, fontFamily: monoFont, fontSize: 9.5, letterSpacing: 0.5 }}>{item.label}</Typography>
                <Typography sx={{ mt: 0.55, maxWidth: 190, color: selected ? alpha(tokens.text, 0.72) : tokens.muted, fontSize: 12, lineHeight: 1.45, display: { xs: 'none', md: 'block' } }}>
                  {item.lines[0]}
                </Typography>
                </Box>
              </Button>
            );
          })}
        </Box>
      <Box sx={{ mt: 2.8, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, gap: { xs: 2.5, md: 4.4 }, alignItems: 'start' }}>
        <Box>
          <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 11, fontWeight: 800, letterSpacing: 0.9 }}>{capability.label}</Typography>
          <Typography sx={{ mt: 0.9, color: tokens.text, fontFamily: headingFont, fontSize: { xs: 27, md: 34 }, fontWeight: 880, lineHeight: 1.08 }}>{capability.title}</Typography>
          <Typography sx={{ mt: 1.05, color: tokens.muted, fontSize: 14.5, lineHeight: 1.68 }}>{capability.description}</Typography>
        </Box>
        <Stack spacing={0}>
          {capability.lines.map((line, index) => (
            <Box key={line} sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', gap: 1, alignItems: 'center', minHeight: 48, borderBottom: `1px solid ${tokens.line}` }}>
              <Typography sx={{ color: tokens.primary, fontFamily: monoFont, fontSize: 10.5, fontWeight: 800 }}>0{index + 1}</Typography>
              <Typography sx={{ color: tokens.text, fontSize: 14.5, lineHeight: 1.5 }}>{line}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 3.4, flexWrap: 'wrap', gap: 1 }}>
        {[
          [<KeyIcon key="key" />, '多模型接入'],
          [<TuneIcon key="tune" />, '深度思考控制'],
          [<LockOutlinedIcon key="lock" />, '记忆与隐私管理'],
          [<CalendarMonthIcon key="calendar" />, '活动与日历'],
        ].map(([icon, label]) => (
          <Chip key={String(label)} icon={icon as ReactElement} label={label} variant="outlined" sx={{ borderRadius: 1, borderColor: tokens.line, color: tokens.muted, '& .MuiChip-icon': { color: tokens.primary } }} />
        ))}
      </Stack>
    </Box>
  );
}

export default function IntroExperiencePage() {
  const theme = useTheme<Theme>();
  const tokens = useMemo(() => getTokens(theme), [theme]);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const navigate = useNavigate();
  const { setHideMobileBottomNav } = useLayoutHeaderActions();

  useEffect(() => {
    setHideMobileBottomNav(true);
    return () => setHideMobileBottomNav(false);
  }, [setHideMobileBottomNav]);

  return (
    <Box
      sx={{
        minHeight: '100%',
        backgroundColor: tokens.bg,
        color: tokens.text,
        overflow: 'hidden',
        '& @keyframes introStageBreath': {
          '0%, 100%': { transform: 'translateY(0)', borderColor: alpha(tokens.primary, 0.28) },
          '50%': { transform: 'translateY(-3px)', borderColor: alpha(tokens.primary, 0.44) },
        },
        '& @keyframes introMessageIn': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '& *, & *::before, & *::after': {
            animationDuration: '0.001ms !important',
            animationIterationCount: '1 !important',
            scrollBehavior: 'auto !important',
            transitionDuration: '0.001ms !important',
          },
        },
      }}
    >
      <HeroRoom
        tokens={tokens}
        reducedMotion={reducedMotion}
        onCreate={() => navigate('/characters/create')}
        onStart={() => navigate('/chats/create')}
      />
      <PainSection tokens={tokens} />
      <MindProjectionSection tokens={tokens} reducedMotion={reducedMotion} />
      <ContinuitySection tokens={tokens} />
      <ChannelSection tokens={tokens} />
      <CapabilitySection tokens={tokens} />
      <Box sx={{ width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 7.5, md: 11.5 }, textAlign: 'center', borderTop: `1px solid ${tokens.line}` }}>
        <PsychologyIcon sx={{ color: tokens.primary, fontSize: 34 }} />
        <Typography component="h2" sx={{ mt: 1.8, color: tokens.text, fontFamily: headingFont, fontSize: { xs: 31, md: 48 }, fontWeight: 880, lineHeight: 1.06 }}>
          这些不是在设置里选的，
          <Box component="span" sx={{ display: 'block', color: tokens.primary }}>是在对话里长出来的。</Box>
        </Typography>
        <Typography sx={{ mt: 1.45, mx: 'auto', maxWidth: 660, color: tokens.muted, fontSize: 14.5, lineHeight: 1.68 }}>
          创建几个角色，给他们一个话题。谁会记得旧事，谁会改变语气，谁会把关系带到下一次相处里，都会在时间中显形。
        </Typography>
        <Stack direction="row" spacing={1.2} sx={{ mt: 2.8, flexWrap: 'wrap', gap: 1.2, justifyContent: 'center' }}>
          <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/chats/create')} sx={{ borderRadius: 1.5, px: 2.2, py: 1.15, bgcolor: tokens.primary, color: tokens.darkInk, fontWeight: 800, '&:hover': { bgcolor: tokens.warning } }}>
            开始群聊
          </Button>
          <Button variant="outlined" onClick={() => navigate('/characters/create')} sx={{ borderRadius: 1.5, px: 2.2, py: 1.15, color: tokens.text, borderColor: tokens.line, '&:hover': { borderColor: tokens.primary, bgcolor: alpha(tokens.primary, 0.08) } }}>
            创建角色
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
