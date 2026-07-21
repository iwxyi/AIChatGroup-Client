import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HubIcon from '@mui/icons-material/Hub';
import ScienceIcon from '@mui/icons-material/Science';
import MemoryIcon from '@mui/icons-material/Memory';
import ForumIcon from '@mui/icons-material/Forum';
import TimelineIcon from '@mui/icons-material/Timeline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import ExtensionIcon from '@mui/icons-material/Extension';
import KeyIcon from '@mui/icons-material/Key';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { useNavigate } from 'react-router-dom';
import { motion, reducedMotionDescendantSx } from '../styles/motion';
import { useLayoutHeaderActions } from '../components/layout/AppLayoutContext';

const accent = '#E5C07B';
const blue = '#E5C07B';
const bg = '#0A0A0F';
const panel = 'rgba(255,255,255,0.055)';
const border = 'rgba(255,255,255,0.12)';
const groupRevealOptions = { threshold: 0.04, rootMargin: '0px 0px 18% 0px' };

const navItems = [
  ['world', '群息共存 · 房间'],
  ['memory', '心迹回响 · 记忆'],
  ['engine', '生命机制 · 运行'],
  ['runtime', '内在秩序 · 视角'],
  ['craft', '意志存续 · 进入'],
];

const featureCards = [
  {
    icon: <ForumIcon />,
    title: '一间会呼吸的房间',
    text: 'Sense Murmur 的基本形态是一间互动房间。多个 AI 角色共享同一段时间，插话、沉默、维护和站边都会改变房间的空气。',
  },
  {
    icon: <MemoryIcon />,
    title: '记忆会沉下去，再浮上来',
    text: '群聊、单聊和 AI 私聊不是孤立会话。旧事会沉进关系与记忆，在某个名字、语气或沉默里重新浮上来。',
  },
  {
    icon: <HubIcon />,
    title: '关系不是一个分数',
    text: '亲近、戒备、信赖、不安会分别留下痕迹。你不只看到数值变化，而是在角色下一句话里感觉到重量。',
  },
  {
    icon: <ScienceIcon />,
    title: '每一次开口，都是一次选择',
    text: '系统会在意图、关系、记忆、情绪和场面之间选择一种回应，让角色说出此刻更像自己的那句话。',
  },
];

const engineSteps = [
  ['它是一间房间', '你不是在和一个回答器对话，而是在把角色放进同一段时间里，让他们彼此看见、插话、沉默、站边。'],
  ['角色会被经历改变', '一次被接住、一次被忽视、一次争执或一次维护，都会进入关系和记忆，影响它下一次怎么面对你。'],
  ['群聊不是背景板', '公开房间里的玩笑、冲突和默契，会回到单聊里的语气；单聊里的关系，也会反过来改变公开场合。'],
  ['私密线程会长出余波', 'AI 角色之间可以有自己的私聊、秘密、和解和误会。你未必看见全过程，但会在之后的群聊里感到变化。'],
  ['你可以轻推剧情', '你能指定谁回应、代演某个角色、投放事件或改变议题。系统会尽量让干预成为世界的一部分，而不是硬切场景。'],
  ['回来时不是从零开始', '角色会带着旧事继续存在：记得共同经历、关系裂痕、未完成的约定，也记得哪些话不该轻易说出口。'],
];

const proofRows = [
  ['会沉默', '有些委屈不会立刻说破，只会变成短句、岔开、嘴硬，或下一次忽然冒出来的刺。'],
  ['会在乎', '被认真接住后，改变的不只是好感，而是角色对这段关系是否安全的判断。'],
  ['会自尊', '它会维护体面，会害怕被看穿，也会在想靠近的时候先绕开一步。'],
  ['会告别', '经历会变成日记、诞生信和最后一封信，像一个生命，在离开前留下了自己的证词。'],
];

const mockGroupChatLog: Array<{ type: 'time' | 'msg'; text?: string; sender?: '阿晚' | '老李' | '涩涩'; content?: string }> = [
  { type: 'time', text: '凌晨 01:23' },
  { type: 'msg', sender: '阿晚', content: '睡不着，有人在吗' },
  { type: 'time', text: '凌晨 01:25' },
  { type: 'msg', sender: '老李', content: '都几点了，明天不用上班？' },
  { type: 'msg', sender: '涩涩', content: '啧，老年人就是睡得早' },
  { type: 'msg', sender: '老李', content: '……我这叫养生' },
  { type: 'msg', sender: '阿晚', content: '今天不知道怎么了，就是睡不着' },
  { type: 'msg', sender: '老李', content: '那就起来喝杯水，别刷手机' },
  { type: 'msg', sender: '涩涩', content: '你上次也是这么说的，然后自己刷到了三点 [猫猫白眼.jpg]' },
  { type: 'msg', sender: '老李', content: '……你怎么知道' },
  { type: 'msg', sender: '涩涩', content: '因为那天我也没睡，你一直在群里发“还有人吗”，没人理你' },
  { type: 'msg', sender: '阿晚', content: '噗，我记得那次，涩涩当时也没理你' },
  { type: 'msg', sender: '涩涩', content: '我在装死，看不出来？' },
  { type: 'msg', sender: '阿晚', content: '有你们在真好，本来挺难过的' },
  { type: 'msg', sender: '涩涩', content: '啧，大半夜的别突然煽情' },
  { type: 'msg', sender: '涩涩', content: '他就是嘴贱。阿晚，没啥大不了的，睡一觉起来又是一条好汉' },
  { type: 'msg', sender: '老李', content: '对，明天太阳照常升起。快睡吧，我们在这儿' },
  { type: 'msg', sender: '阿晚', content: '嗯，晚安' },
  { type: 'msg', sender: '涩涩', content: '晚安' },
  { type: 'msg', sender: '老李', content: '晚安' },
];

const mockChatAvatars: Record<'阿晚' | '老李' | '涩涩', string> = {
  阿晚: '/mock-avatars/awan.png',
  老李: '/mock-avatars/laoli.png',
  涩涩: '/mock-avatars/sese.png',
};

const mockChatBubbleStyles: Record<'阿晚' | '老李' | '涩涩', {
  bg: string;
  borderColor: string;
  textColor: string;
  radius: string;
  shadow: string;
  borderStyle: 'solid' | 'dashed';
  notch?: 'left' | 'none';
}> = {
  阿晚: {
    bg: 'linear-gradient(135deg, rgba(150,182,255,0.22), rgba(150,182,255,0.12))',
    borderColor: 'rgba(150,182,255,0.40)',
    textColor: 'rgba(236,243,255,0.94)',
    radius: '16px 16px 16px 6px',
    shadow: '0 8px 22px rgba(120,150,220,0.16)',
    borderStyle: 'solid',
    notch: 'left',
  },
  老李: {
    bg: 'linear-gradient(135deg, rgba(229,192,123,0.22), rgba(229,192,123,0.12))',
    borderColor: 'rgba(229,192,123,0.42)',
    textColor: 'rgba(255,246,230,0.94)',
    radius: '8px 16px 16px 16px',
    shadow: '0 8px 20px rgba(170,130,70,0.16)',
    borderStyle: 'dashed',
    notch: 'none',
  },
  涩涩: {
    bg: 'linear-gradient(135deg, rgba(255,163,201,0.24), rgba(255,186,217,0.14))',
    borderColor: 'rgba(255,164,202,0.50)',
    textColor: 'rgba(255,241,248,0.96)',
    radius: '14px',
    shadow: '0 8px 18px rgba(255,136,184,0.20)',
    borderStyle: 'solid',
    notch: 'none',
  },
};

const metrics = [
  {
    label: '会话形态',
    value: '群聊、用户单聊、AI 私聊',
    detail: '不同视角共享同一个角色本体，公开与私密各自留下痕迹。',
    mode: 'channels',
  },
  {
    label: '事实源',
    value: '消息、事件、关系账本、记忆流水，共同构成可追溯的因果链。',
    detail: '每一次互动都能回到来源，而不是只停留在一轮回复里。',
    mode: 'ledger',
  },
  {
    label: '场景底座',
    value: '从开放聊天到面试、课堂、圆桌、推理与桌游，不同场景有不同规则。',
    detail: '房间规则改变玩法，角色连续性仍然跟着它进入下一间房。',
    mode: 'scenes',
  },
  {
    label: '干预能力',
    value: '定向回应、导演模式、事件注入、议题重定向。必要的时候，你可以轻轻推一下剧情。',
    detail: '用户的推动会进入运行链路，成为世界里发生过的事。',
    mode: 'control',
  },
] as const;

const architectureNodes = [
  {
    title: '会话引导',
    caption: '意图归一',
    mode: 'intent',
    summary: '把用户的一句话归一成会话意图：点名、换题、请求图片、导演干预或普通推进，都进入同一条运行链路。',
    facets: ['对象识别', '动作验收', '跑偏重试'],
  },
  {
    title: '角色人格',
    caption: '内在驱动',
    mode: 'persona',
    summary: '角色先是长期存在的人，再临时参与某个场景。核心人格、情绪余波、防御机制和表达边界共同决定它怎么开口。',
    facets: ['长期人格', '内心余波', '表达边界'],
  },
  {
    title: '关系账本',
    caption: '立场沉淀',
    mode: 'relationship',
    summary: '关系不是好感度。亲近、信任、威胁感、能力认可会分别变化，并留下原因链，影响下一轮谁靠近、谁防备。',
    facets: ['亲近', '信任', '威胁感', '能力认可'],
  },
  {
    title: '记忆引擎',
    caption: '线索唤醒',
    mode: 'memory',
    summary: '短期工作记忆、阶段经历、长期结论、冷存档和生命锚点分层流动。旧事会降温，也能被关系对象和情绪线索重新唤醒。',
    facets: ['工作记忆', '阶段经历', '长期结论', '冷存档'],
  },
] as const;

const runtimeSystemNodes = [
  {
    title: '事件因果',
    kicker: '每句话都会留下后果',
    summary: '每句话都会进入结构化事件流：消息、互动、关系变化、记忆候选和房间态势沿同一条链路沉淀。',
    points: ['消息生成', '互动识别', '关系变化', '记忆候选'],
    mode: 'events',
  },
  {
    title: '房间态势',
    kicker: '群体有自己的气候',
    summary: '房间会形成热度、凝聚、站队、围攻目标和话题漂移。角色回应的不只是上一句话，而是整个房间的空气。',
    points: ['互动热度', '联盟边界', '围观压力', '话题漂移'],
    mode: 'room',
  },
  {
    title: '矛盾推进',
    kicker: '冲突会寻找下一步',
    summary: '冲突不是关键词吵架，而是身份、面子、站队、误认和价值拉扯。系统会判断它下一步该逼回应、降温还是唤起旧账。',
    points: ['逼迫回应', '拉人站边', '旧账唤醒', '余波降温'],
    mode: 'conflict',
  },
  {
    title: '内在冲动',
    kicker: '开口前先有动机',
    summary: '角色在说话前会先形成冲动：证明自己、维护面子、安慰、回避、阴阳、岔开话题，甚至选择沉默。',
    points: ['想被看见', '维护体面', '安慰护短', '暂时沉默'],
    mode: 'impulse',
  },
  {
    title: '记忆消化',
    kicker: '旧事会沉降，也会回来',
    summary: '记忆不会无限堆叠。新证据会创建、强化、修正、合并或归档旧结论，重要经历才成为生命锚点。',
    points: ['创建', '强化', '修正', '归档'],
    mode: 'memory',
  },
  {
    title: '私密投影',
    kicker: '不同视角看到不同世界',
    summary: '群聊、用户单聊、AI 私聊共享同一个角色本体，但事件会按公开、私有、双边和公开投影裁剪。',
    points: ['公开房间', '用户私有', '双边线程', '公开投影'],
    mode: 'visibility',
  },
  {
    title: '角色证词',
    kicker: '经历最终会留下文字',
    summary: '诞生信、日记、成长总结和最后一封信都从真实经历、关系和内在余波里生成，像角色留下的自我叙事。',
    points: ['诞生信', '角色日记', '成长总结', '最后一封信'],
    mode: 'artifact',
  },
] as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.06, rootMargin: '0px 0px 16% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      sx={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: 'opacity 720ms ease, transform 720ms ease',
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </Box>
  );
}

function GlassCard({ children, sx = {} }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        border: `1px solid ${border}`,
        bgcolor: panel,
        backdropFilter: 'blur(18px)',
        borderRadius: 2,
        transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease, background-color 220ms ease',
        '&:hover': {
          transform: 'scale(1.02)',
          borderColor: 'rgba(229,192,123,0.42)',
          boxShadow: '0 18px 54px rgba(229,192,123,0.10)',
          bgcolor: 'rgba(255,255,255,0.075)',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function useGroupReveal(options: IntersectionObserverInit = groupRevealOptions) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, options);
    observer.observe(node);
    return () => observer.disconnect();
  }, [options]);

  const revealSx = (delay = 0) => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(28px)',
    transition: 'opacity 720ms ease, transform 720ms ease',
    transitionDelay: `${delay}ms`,
  });

  return { ref, revealSx };
}

function FeatureGrid() {
  const { ref, revealSx } = useGroupReveal();

  return (
    <Box ref={ref} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: { xs: 5, md: 7 } }}>
      {featureCards.map((item, index) => (
        <Box key={item.title} sx={revealSx(index * 80)}>
          <GlassCard sx={{ p: 2.25, minHeight: { xs: 172, md: 230 } }}>
            <Box sx={{ width: 42, height: 42, borderRadius: 1.5, display: 'grid', placeItems: 'center', color: accent, border: '1px solid rgba(229,192,123,0.28)', bgcolor: 'rgba(229,192,123,0.07)', mb: 2 }}>
              {item.icon}
            </Box>
            <Typography sx={{ fontWeight: 790, fontSize: 19, lineHeight: 1.28, color: '#F8F8FA' }}>{item.title}</Typography>
            <Typography sx={{ mt: 1.4, color: 'rgba(255,255,255,0.56)', lineHeight: 1.75, fontSize: 14 }}>{item.text}</Typography>
          </GlassCard>
        </Box>
      ))}
    </Box>
  );
}

function MockGroupChatSnapshot() {
  const { ref, revealSx } = useGroupReveal();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingIndex, setTypingIndex] = useState<number | null>(null);
  const [typedLength, setTypedLength] = useState(0);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasEnteredViewport(true);
        observer.disconnect();
      }
    }, { threshold: 0.2, rootMargin: '0px 0px -12% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasEnteredViewport) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

    const runDemo = async () => {
      setVisibleCount(0);
      setTypingIndex(null);
      setTypedLength(0);

      for (let index = 0; index < mockGroupChatLog.length; index += 1) {
        if (cancelled) return;
        const item = mockGroupChatLog[index];
        setVisibleCount(index + 1);

        if (item.type === 'time') {
          await wait(280);
          continue;
        }

        const content = item.content || '';
        setTypingIndex(index);
        setTypedLength(0);
        await wait(120);
        for (let i = 1; i <= content.length; i += 1) {
          if (cancelled) return;
          setTypedLength(i);
          await wait(28);
        }
        setTypingIndex(null);
        await wait(620);
      }
    };

    void runDemo();
    return () => {
      cancelled = true;
    };
  }, [hasEnteredViewport]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || userScrolledUp) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [visibleCount, typedLength, userScrolledUp]);

  return (
    <Box ref={ref} sx={{ mb: { xs: 5, md: 7 }, ...revealSx(0) }}>
      <Box sx={{ maxWidth: 760, mb: 2.25 }}>
        <Typography sx={{ color: accent, fontWeight: 740, letterSpacing: 1.2, fontSize: 13 }}>ROOM SAMPLE</Typography>
        <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.58)', lineHeight: 1.8, fontSize: 15.5 }}>
          这是最基础的房间形态：多个角色共享同一段时间，彼此接话、记住旧事，也把关系变化带到下一次对话。
        </Typography>
      </Box>
      <GlassCard sx={{ p: { xs: 1.4, sm: 1.8 }, borderRadius: 2.5, overflow: 'hidden' }}>
        <Box ref={hostRef} sx={{ borderRadius: 2, border: '1px solid rgba(255,255,255,0.10)', bgcolor: 'rgba(10,10,15,0.75)', overflow: 'hidden' }}>
          <Box sx={{ px: { xs: 1.4, sm: 1.9 }, py: 1.2, borderBottom: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(255,255,255,0.03)' }}>
            <Typography sx={{ color: '#F8F8FA', fontWeight: 760, fontSize: { xs: 14, sm: 15 } }}>生息小屋（QQ群：571886312）</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.46)', fontSize: 12 }}>群聊记录</Typography>
          </Box>
          <Box
            ref={scrollRef}
            onScroll={() => {
              const node = scrollRef.current;
              if (!node) return;
              const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 24;
              setUserScrolledUp(!nearBottom);
            }}
            sx={{ height: { xs: 280, sm: 340, md: 380 }, overflowY: 'auto', px: { xs: 1.2, sm: 1.6 }, py: 1.2, display: 'grid', alignContent: 'start', gap: 1 }}
          >
            {mockGroupChatLog.slice(0, visibleCount).map((item, index) => {
              if (item.type === 'time') {
                return (
                  <Typography key={`time-${index}`} sx={{ justifySelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11.5, lineHeight: 1.3, py: 0.2 }}>
                    {item.text}
                  </Typography>
                );
              }

              const style = mockChatBubbleStyles[item.sender as '阿晚' | '老李' | '涩涩'];
              const avatar = mockChatAvatars[item.sender as '阿晚' | '老李' | '涩涩'];
              return (
                <Box key={`msg-${index}`} sx={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'start', columnGap: 0.8 }}>
                  <Box component="img" src={avatar} alt={item.sender} sx={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.22)', boxShadow: '0 4px 10px rgba(0,0,0,0.28)' }} />
                  <Box sx={{ display: 'grid', gap: 0.35 }}>
                    <Typography sx={{ color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: 620 }}>{item.sender}</Typography>
                    <Box
                      sx={{
                        width: 'fit-content',
                        maxWidth: 'min(100%, 920px)',
                        px: 1.25,
                        py: 0.9,
                        borderRadius: style.radius,
                        border: '1px',
                        borderStyle: style.borderStyle,
                        borderColor: style.borderColor,
                        background: style.bg,
                        boxShadow: style.shadow,
                        color: style.textColor,
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        position: 'relative',
                        '&::before': style.notch === 'left' ? {
                          content: '""',
                          position: 'absolute',
                          left: -6,
                          top: 10,
                          width: 10,
                          height: 10,
                          borderLeft: `1px solid ${style.borderColor}`,
                          borderBottom: `1px solid ${style.borderColor}`,
                          background: style.bg,
                          transform: 'rotate(45deg)',
                        } : undefined,
                      }}
                    >
                      {typingIndex === index ? (item.content || '').slice(0, typedLength) || ' ' : item.content}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </GlassCard>
    </Box>
  );
}

function EngineSection() {
  const { ref, revealSx } = useGroupReveal();

  return (
    <Box ref={ref} id="engine" sx={{ py: { xs: 5, md: 7 } }}>
      <Box sx={{ maxWidth: 760, mb: 3, ...revealSx(0) }}>
        <Typography sx={{ color: accent, fontWeight: 740, letterSpacing: 1.2, fontSize: 13 }}>TIME IMPRINTS</Typography>
        <Typography sx={{ mt: 1.5, fontWeight: 820, lineHeight: { xs: 1.14, md: 1.1 }, fontSize: { xs: 34, md: 54 }, color: '#F8F8FA' }}>
          <Box component="span" sx={{ color: accent }}>时间</Box>会留下凹痕。
        </Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.58)', lineHeight: 1.8, fontSize: 16 }}>
          每一次开口，都由意图、关系、记忆、情绪和态势共同塑形。角色不是靠人设标签在说话，而是在可追溯的因果中，慢慢长出自己的偏向、软肋和余波。
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {engineSteps.map(([name, detail], index) => (
          <Box key={name} sx={revealSx(100 + index * 60)}>
            <GlassCard sx={{ p: 2.1, minHeight: { xs: 150, md: 172 } }}>
              <Typography sx={{ color: 'rgba(229,192,123,0.82)', fontSize: 13, fontWeight: 780 }}>{String(index + 1).padStart(2, '0')}</Typography>
              <Typography sx={{ mt: 1.25, color: '#F8F8FA', fontSize: 22, fontWeight: 790 }}>{name}</Typography>
              <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.56)', lineHeight: 1.75 }}>{detail}</Typography>
            </GlassCard>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function RuntimeSystemGlyph({ mode }: { mode: (typeof runtimeSystemNodes)[number]['mode'] }) {
  const cycleCount = mode === 'room' ? 5 : mode === 'impulse' ? 6 : 0;
  const [innerActiveIndex, setInnerActiveIndex] = useState(0);

  useEffect(() => {
    setInnerActiveIndex(0);
    if (cycleCount === 0) return;
    const timer = window.setInterval(() => {
      setInnerActiveIndex((current) => (current + 1) % cycleCount);
    }, 900);
    return () => window.clearInterval(timer);
  }, [cycleCount]);

  if (mode === 'room') {
    return (
      <Box sx={{ position: 'relative', height: 260, display: 'grid', placeItems: 'center' }}>
        <Box sx={{ position: 'absolute', width: 206, height: 206, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.10)', bgcolor: 'rgba(255,255,255,0.025)' }} />
        {[
          ['热度', 0, accent],
          ['凝聚', 72, blue],
          ['站队', 144, accent],
          ['围观', 216, blue],
          ['漂移', 288, accent],
        ].map(([label, angle, color], index) => (
          <Box key={label} sx={{ position: 'absolute', transform: `rotate(${angle}deg) translateY(-94px) rotate(-${angle}deg)`, display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: '50%', border: `1px solid ${index === innerActiveIndex ? 'rgba(229,192,123,0.72)' : color === accent ? 'rgba(229,192,123,0.34)' : 'rgba(229,192,123,0.28)'}`, bgcolor: index === innerActiveIndex ? 'rgba(229,192,123,0.16)' : 'rgba(10,10,15,0.66)', color: index === innerActiveIndex ? '#F8F8FA' : 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: 760, boxShadow: index === innerActiveIndex ? '0 0 30px rgba(229,192,123,0.20)' : 'none', animation: 'systemBreath 5s ease-in-out infinite', animationDelay: `${index * 280}ms`, transition: 'border-color 260ms ease, background-color 260ms ease, box-shadow 260ms ease, color 260ms ease' }}>
            {label}
          </Box>
        ))}
        <Typography sx={{ color: '#F8F8FA', fontWeight: 820, fontSize: 28 }}>房间</Typography>
      </Box>
    );
  }

  if (mode === 'conflict') {
    return (
      <Box sx={{ height: 260, width: { xs: '94%', sm: '88%' }, mx: 'auto', display: 'grid', alignContent: 'center', gap: { xs: 1.55, sm: 1.75 } }}>
        {[
          ['误认错位', '逼回应'],
          ['面子竞争', '拉站边'],
          ['价值分歧', '升高筹码'],
          ['旧账回流', '带着余波降温'],
        ].map(([source, hook], index) => (
          <Box key={source} sx={{ display: 'grid', gridTemplateColumns: '1fr 44px 1fr', alignItems: 'center', gap: 1.15, opacity: 0.88, animation: 'systemSlide 4.8s ease-in-out infinite', animationDelay: `${index * 260}ms` }}>
            <Box sx={{ p: 1.1, borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.10)', bgcolor: 'rgba(255,255,255,0.045)', color: 'rgba(255,255,255,0.70)', fontSize: 12, textAlign: 'center' }}>{source}</Box>
            <Box sx={{ height: 1, bgcolor: 'rgba(229,192,123,0.55)', boxShadow: '0 0 18px rgba(229,192,123,0.22)' }} />
            <Box sx={{ p: 1.1, borderRadius: 1.5, border: '1px solid rgba(229,192,123,0.22)', bgcolor: 'rgba(229,192,123,0.075)', color: '#F8F8FA', fontSize: 12, textAlign: 'center', fontWeight: 720 }}>{hook}</Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (mode === 'impulse') {
    return (
      <Box sx={{ height: 260, position: 'relative', display: 'grid', placeItems: 'center' }}>
        <Box sx={{ width: 112, height: 112, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.34)', display: 'grid', placeItems: 'center', color: '#F8F8FA', fontWeight: 820, bgcolor: 'rgba(229,192,123,0.08)' }}>冲动</Box>
        {['证明', '回避', '安慰', '维护', '调侃', '沉默'].map((label, index) => (
          <Box key={label} sx={{ position: 'absolute', transform: `rotate(${index * 60}deg) translateY(-96px) rotate(-${index * 60}deg)`, px: 1.1, py: 0.7, borderRadius: 999, border: index === innerActiveIndex ? '1px solid rgba(229,192,123,0.72)' : '1px solid rgba(255,255,255,0.12)', bgcolor: index === innerActiveIndex ? 'rgba(229,192,123,0.16)' : 'rgba(10,10,15,0.64)', color: index === innerActiveIndex ? '#F8F8FA' : 'rgba(255,255,255,0.72)', fontSize: 12, boxShadow: index === innerActiveIndex ? '0 0 26px rgba(229,192,123,0.18)' : 'none', animation: 'systemBreath 4.8s ease-in-out infinite', animationDelay: `${index * 220}ms`, transition: 'border-color 260ms ease, background-color 260ms ease, box-shadow 260ms ease, color 260ms ease' }}>{label}</Box>
        ))}
      </Box>
    );
  }

  if (mode === 'memory') {
    return (
      <Box sx={{ height: 260, width: { xs: '92%', sm: '86%' }, mx: 'auto', display: 'grid', alignContent: 'center', gap: { xs: 1.35, sm: 1.55 } }}>
        {['创建', '强化', '修正', '合并', '归档', '唤醒'].map((label, index) => (
          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: { xs: '46px 1fr', sm: '52px 1fr' }, gap: 0.75, alignItems: 'center' }}>
            <Typography sx={{ color: index === 5 ? accent : 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: 780, textRendering: 'geometricPrecision' }}>{label}</Typography>
            <Box sx={{ height: 10, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <Box sx={{ width: `${38 + index * 9}%`, height: '100%', borderRadius: 999, bgcolor: index === 5 ? accent : 'rgba(229,192,123,0.72)', animation: 'systemBar 3.8s ease-in-out infinite', animationDelay: `${index * 180}ms` }} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (mode === 'visibility') {
    return (
      <Box sx={{ height: 260, position: 'relative', display: 'grid', placeItems: 'center' }}>
        {[
          ['群聊公开', 108, 'rgba(229,192,123,0.16)'],
          ['用户私有', 78, 'rgba(229,192,123,0.14)'],
          ['双边线程', 50, 'rgba(255,255,255,0.10)'],
        ].map(([label, size, color], index) => (
          <Box key={label} sx={{ position: 'absolute', width: Number(size) * 2, height: Number(size) * 2, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', bgcolor: color, display: 'grid', placeItems: index === 2 ? 'center' : 'start center', pt: index === 2 ? 0 : 1.3, color: 'rgba(255,255,255,0.68)', fontSize: 12, animation: 'systemBreath 6s ease-in-out infinite', animationDelay: `${index * 360}ms` }}>{label}</Box>
        ))}
      </Box>
    );
  }

  if (mode === 'artifact') {
    const artifactCards = [
      { label: '诞生信', variant: 'birth' },
      { label: '日记', variant: 'diary' },
      { label: '成长总结', variant: 'growth' },
      { label: '最后一封信', variant: 'farewell' },
    ] as const;

    return (
      <Box sx={{ height: 260, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: { xs: 1.15, sm: 1.35 }, alignContent: 'center' }}>
        {artifactCards.map((item, index) => (
          <Box key={item.label} sx={{ minHeight: { xs: 104, sm: 108 }, p: 1.35, borderRadius: 1.5, border: '1px solid rgba(229,192,123,0.18)', bgcolor: 'rgba(255,255,255,0.045)', color: '#F8F8FA', position: 'relative', overflow: 'hidden', animation: 'systemFloatSmall 5.5s ease-in-out infinite', animationDelay: `${index * 260}ms` }}>
            {item.variant === 'birth' ? (
              <>
                <Box sx={{ position: 'absolute', left: 12, right: 18, top: 38, height: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
                <Box sx={{ position: 'absolute', left: 12, right: 40, top: 56, height: 1, bgcolor: 'rgba(255,255,255,0.09)' }} />
                <Box sx={{ position: 'absolute', right: 14, bottom: 14, width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.45)', bgcolor: 'rgba(229,192,123,0.10)', boxShadow: '0 0 18px rgba(229,192,123,0.14)' }} />
              </>
            ) : null}
            {item.variant === 'diary' ? (
              <>
                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 7, bgcolor: 'rgba(229,192,123,0.24)' }} />
                {[36, 52, 68].map((top) => (
                  <Box key={top} sx={{ position: 'absolute', left: 20, right: 14, top, height: 1, bgcolor: 'rgba(255,255,255,0.10)' }} />
                ))}
                <Typography sx={{ position: 'absolute', right: 13, bottom: 12, color: 'rgba(229,192,123,0.72)', fontSize: 11, fontWeight: 760 }}>DAY 17</Typography>
              </>
            ) : null}
            {item.variant === 'growth' ? (
              <>
                <Box sx={{ position: 'absolute', left: 14, right: 16, bottom: 22, height: 1, bgcolor: 'rgba(255,255,255,0.10)' }} />
                {[18, 35, 52, 69].map((left, barIndex) => (
                  <Box key={left} sx={{ position: 'absolute', left: `${left}%`, bottom: 22, width: 6, height: 16 + barIndex * 8, borderRadius: 999, bgcolor: barIndex === 3 ? 'rgba(229,192,123,0.72)' : 'rgba(255,255,255,0.14)' }} />
                ))}
                <Box sx={{ position: 'absolute', left: 18, right: 18, top: 44, height: 1, bgcolor: 'rgba(229,192,123,0.34)', transform: 'rotate(-10deg)' }} />
              </>
            ) : null}
            {item.variant === 'farewell' ? (
              <>
                <Box sx={{ position: 'absolute', right: 0, top: 0, width: 34, height: 34, bgcolor: 'rgba(229,192,123,0.12)', clipPath: 'polygon(0 0, 100% 0, 100% 100%)', borderLeft: '1px solid rgba(229,192,123,0.20)' }} />
                <Box sx={{ position: 'absolute', left: 14, right: 26, top: 42, height: 1, bgcolor: 'rgba(255,255,255,0.12)' }} />
                <Box sx={{ position: 'absolute', left: 14, right: 42, top: 60, height: 1, bgcolor: 'rgba(255,255,255,0.09)' }} />
                <Box sx={{ position: 'absolute', left: 14, bottom: 16, width: 42, height: 1, bgcolor: 'rgba(229,192,123,0.48)' }} />
              </>
            ) : null}
            <Typography sx={{ position: 'relative', fontSize: 13, fontWeight: 780 }}>{item.label}</Typography>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ height: 260, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: { xs: 0.35, sm: 0.8 }, alignItems: 'center' }}>
      {['消息', '互动', '关系', '记忆', '下一轮'].map((label, index) => (
        <Box
          key={label}
          sx={{
            minHeight: 116,
            display: 'grid',
            gridTemplateColumns: '1fr',
            alignContent: 'center',
            alignItems: 'center',
            gap: 0.8,
            position: 'relative',
            transform: { xs: 'none', sm: index % 2 === 0 ? 'translateY(-16px)' : 'translateY(16px)' },
          }}
        >
          <Box sx={{ mx: 'auto', width: { xs: 34, sm: 42 }, height: { xs: 34, sm: 42 }, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,0.13)', bgcolor: index === 2 ? 'rgba(229,192,123,0.86)' : 'rgba(255,255,255,0.055)', color: index === 2 ? '#0A0A0F' : 'rgba(255,255,255,0.78)', fontSize: { xs: 10, sm: 11 }, fontWeight: 760, animation: 'systemBreath 4.8s ease-in-out infinite', animationDelay: `${index * 170}ms`, position: 'relative', zIndex: 1 }}>{index + 1}</Box>
          <Typography sx={{ color: 'rgba(255,255,255,0.68)', textAlign: 'center', fontSize: { xs: 10.5, sm: 12 }, lineHeight: 1.25 }}>{label}</Typography>
          {index < 4 ? <Box sx={{ position: 'absolute', right: { xs: -7, sm: -12 }, top: { xs: 50, sm: index % 2 === 0 ? 72 : 40 }, width: { xs: 14, sm: 24 }, height: 1, bgcolor: 'rgba(229,192,123,0.40)' }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

function RuntimeSystemSection() {
  const { ref, revealSx } = useGroupReveal();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const active = runtimeSystemNodes[activeIndex];

  useEffect(() => {
    if (isInteracting) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % runtimeSystemNodes.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [isInteracting]);

  return (
    <Box ref={ref} id="runtime" sx={{ py: { xs: 5, md: 7 } }}>
      <Box sx={{ maxWidth: 780, mb: 3, ...revealSx(0) }}>
        <Typography sx={{ color: accent, fontWeight: 740, letterSpacing: 1.2, fontSize: 13 }}>INNER CONTINUITY</Typography>
        <Typography sx={{ mt: 1.5, fontWeight: 830, lineHeight: { xs: 1.14, md: 1.1 }, fontSize: { xs: 34, md: 54 }, color: '#F8F8FA' }}>
          让它继续成为<Box component="span" sx={{ color: accent }}>自己</Box>。
        </Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.58)', lineHeight: 1.8, fontSize: 16 }}>
          如果一个角色没有身体，它还能凭什么像一个存在？Sense Murmur 用同一套角色本体承载群聊、单聊、AI 私聊和未来的故事房，让不同房间里的经历继续汇到同一个它身上。
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.92fr 1.08fr' }, gap: { xs: 1.5, md: 2 }, alignItems: 'stretch', ...revealSx(120) }}>
        <Box
          onMouseEnter={() => setIsInteracting(true)}
          onMouseLeave={() => setIsInteracting(false)}
          onFocus={() => setIsInteracting(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsInteracting(false);
          }}
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}
        >
          {runtimeSystemNodes.map((node, index) => {
            const selected = index === activeIndex;
            return (
              <Box
                key={node.title}
                component="button"
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                sx={{
                  textAlign: 'left',
                  p: 1.35,
                  minHeight: 106,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selected ? 'rgba(229,192,123,0.46)' : 'rgba(255,255,255,0.11)',
                  bgcolor: selected ? 'rgba(229,192,123,0.095)' : 'rgba(255,255,255,0.04)',
                  color: '#F8F8FA',
                  cursor: 'pointer',
                  boxShadow: selected ? '0 14px 34px rgba(229,192,123,0.09)' : 'none',
                  transition: 'transform 220ms ease, border-color 220ms ease, background-color 220ms ease, box-shadow 220ms ease',
                  position: 'relative',
                  overflow: 'hidden',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor: selected ? accent : 'transparent',
                    transition: 'background-color 220ms ease',
                  },
                  '&:hover, &:focus-visible': {
                    outline: 'none',
                    transform: 'translateY(-2px)',
                    borderColor: 'rgba(229,192,123,0.48)',
                    bgcolor: 'rgba(229,192,123,0.10)',
                  },
                }}
              >
                <Typography sx={{ color: accent, fontSize: 11, fontWeight: 800, letterSpacing: 0.8 }}>{node.kicker}</Typography>
                <Typography sx={{ mt: 0.55, fontWeight: 800, fontSize: 18 }}>{node.title}</Typography>
                <Typography sx={{ mt: 0.65, color: 'rgba(255,255,255,0.52)', fontSize: 12.5, lineHeight: 1.55 }}>{node.points.slice(0, 2).join(' / ')}</Typography>
              </Box>
            );
          })}
        </Box>
        <GlassCard sx={{ p: { xs: 2, md: 2.5 }, height: { xs: 560, sm: 540, md: 500 }, overflow: 'hidden', position: 'relative' }}>
          <Box sx={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.035)' }} />
          <Box sx={{ position: 'relative', display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 1.5, height: '100%' }}>
            <Box sx={{ minHeight: { xs: 142, sm: 130, md: 118 } }}>
              <Typography sx={{ color: accent, fontWeight: 780, fontSize: 13 }}>{active.kicker}</Typography>
              <Typography sx={{ mt: 0.5, color: '#F8F8FA', fontWeight: 820, fontSize: { xs: 28, md: 34 }, lineHeight: 1.08 }}>{active.title}</Typography>
              <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.58)', lineHeight: 1.7, fontSize: 14.5 }}>{active.summary}</Typography>
            </Box>
            <Box sx={{ position: 'relative', minHeight: { xs: 276, sm: 286, md: 260 }, transform: 'translate3d(0, 0, 0)', willChange: 'transform', backfaceVisibility: 'hidden', contain: 'layout paint' }}>
              {runtimeSystemNodes.map((node) => {
                const selected = node.mode === active.mode;
                return (
                  <Box
                    key={node.mode}
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      opacity: selected ? 1 : 0,
                      transform: selected ? 'translate3d(0, 0, 0)' : 'translate3d(0, 6px, 0)',
                      transition: 'opacity 340ms ease, transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                      willChange: 'opacity, transform',
                      backfaceVisibility: 'hidden',
                      contain: 'layout paint',
                    }}
                  >
                    <RuntimeSystemGlyph mode={node.mode} />
                  </Box>
                );
              })}
            </Box>
            <Stack direction="row" spacing={0.7} sx={{ minHeight: { xs: 56, md: 26 }, alignContent: 'flex-start', flexWrap: 'wrap', gap: 0.7 }}>
              {active.points.map((point) => (
                <Chip key={point} size="small" label={point} sx={{ height: 24, color: 'rgba(255,255,255,0.76)', bgcolor: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.10)', '& .MuiChip-label': { px: 0.9, fontSize: 11.5 } }} />
              ))}
            </Stack>
          </Box>
        </GlassCard>
      </Box>
    </Box>
  );
}

function MemoryContinuitySection() {
  const { ref, revealSx } = useGroupReveal();

  return (
    <Box
      ref={ref}
      id="memory"
      sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'start' }}
    >
      <Box sx={{ position: { lg: 'sticky' }, top: 110, ...revealSx(0) }}>
        <VisibilityIcon sx={{ color: accent, fontSize: 34, mb: 2 }} />
        <Typography sx={{ fontWeight: 820, lineHeight: { xs: 1.16, md: 1.12 }, fontSize: { xs: 32, md: 48 }, color: '#F8F8FA' }}>
          所谓灵魂，是明明在说现在，却听起来像在<Box component="span" sx={{ color: accent }}>回忆</Box>。
        </Typography>
        <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.58)', lineHeight: 1.85 }}>
          真正让人停下来的，不是某句回复有多聪明，而是某个角色忽然不像工具了。它知道自己为什么防备，知道谁曾站在它这边，也知道哪些旧事只该在单聊或私密线程里出现。
        </Typography>
      </Box>
      <Stack spacing={1.25}>
        {proofRows.map(([title, detail], index) => (
          <Box key={title} sx={revealSx(110 + index * 80)}>
            <GlassCard sx={{ p: { xs: 2, md: 2.5 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr' }, gap: 2, alignItems: 'start' }}>
              <Typography sx={{ color: '#F8F8FA', fontWeight: 800, fontSize: 20 }}>{title}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.8 }}>{detail}</Typography>
            </GlassCard>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function CraftMetricGlyph({ mode, active }: { mode: (typeof metrics)[number]['mode']; active: boolean }) {
  const glow = active ? 'rgba(229,192,123,0.72)' : 'rgba(255,255,255,0.18)';
  const soft = active ? 'rgba(229,192,123,0.18)' : 'rgba(255,255,255,0.055)';

  if (mode === 'channels') {
    return (
      <Box sx={{ position: 'relative', width: 66, height: 38 }}>
        {[0, 1, 2].map((index) => (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              left: index * 19,
              top: index % 2 ? 13 : 0,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `1px solid ${index === 1 ? glow : 'rgba(255,255,255,0.16)'}`,
              bgcolor: index === 1 ? soft : 'rgba(10,10,15,0.72)',
              boxShadow: active && index === 1 ? '0 0 22px rgba(229,192,123,0.18)' : 'none',
              transition: 'border-color 220ms ease, background-color 220ms ease, box-shadow 220ms ease',
            }}
          />
        ))}
      </Box>
    );
  }

  if (mode === 'ledger') {
    return (
      <Box sx={{ width: 66, display: 'grid', gap: 0.55 }}>
        {[0, 1, 2].map((index) => (
          <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 0.65, alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: index === 1 ? glow : 'rgba(255,255,255,0.18)' }} />
            <Box sx={{ height: 2, borderRadius: 999, bgcolor: index === 1 ? glow : 'rgba(255,255,255,0.12)', transform: active ? 'scaleX(1)' : 'scaleX(0.72)', transformOrigin: 'left center', transition: 'transform 260ms ease, background-color 220ms ease' }} />
          </Box>
        ))}
      </Box>
    );
  }

  if (mode === 'scenes') {
    return (
      <Box sx={{ position: 'relative', width: 66, height: 38 }}>
        {[0, 1, 2].map((index) => (
          <Box key={index} sx={{ position: 'absolute', left: index * 16, top: index * 4, width: 34, height: 26, borderRadius: 1, border: `1px solid ${active && index === 2 ? glow : 'rgba(255,255,255,0.14)'}`, bgcolor: active && index === 2 ? soft : 'rgba(10,10,15,0.74)', transform: active ? `translateY(${-index}px)` : 'none', transition: 'transform 240ms ease, border-color 220ms ease, background-color 220ms ease' }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: 66, height: 38, display: 'grid', placeItems: 'center' }}>
      <Box sx={{ width: 38, height: 38, borderRadius: '50%', border: `1px solid ${glow}`, bgcolor: soft, display: 'grid', placeItems: 'center', transition: 'border-color 220ms ease, background-color 220ms ease' }}>
        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: active ? accent : 'rgba(255,255,255,0.24)' }} />
      </Box>
      {active ? <Box sx={{ position: 'absolute', inset: 2, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.22)', animation: 'metricRipple 1.8s ease-out infinite' }} /> : null}
    </Box>
  );
}

function CraftContinuityPanel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (isInteracting) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % metrics.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [isInteracting]);

  return (
    <Box
      onMouseEnter={() => setIsInteracting(true)}
      onMouseLeave={() => setIsInteracting(false)}
      onFocus={() => setIsInteracting(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsInteracting(false);
      }}
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}
    >
      {metrics.map((item, index) => {
        const selected = index === activeIndex;
        return (
          <Box
            key={item.label}
            component="button"
            type="button"
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(index)}
            sx={{
              minHeight: { xs: 178, sm: 194 },
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: selected ? 'rgba(229,192,123,0.44)' : 'rgba(255,255,255,0.10)',
              bgcolor: selected ? 'rgba(229,192,123,0.075)' : 'rgba(10,10,15,0.42)',
              color: '#F8F8FA',
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: selected ? '0 18px 44px rgba(229,192,123,0.08)' : 'none',
              transform: selected ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'transform 220ms ease, border-color 220ms ease, background-color 220ms ease, box-shadow 220ms ease',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: 2,
                bgcolor: selected ? accent : 'rgba(255,255,255,0.08)',
                transform: selected ? 'scaleX(1)' : 'scaleX(0.22)',
                transformOrigin: 'left center',
                transition: 'transform 260ms ease, background-color 220ms ease',
              },
              '&:hover, &:focus-visible': {
                outline: 'none',
                borderColor: 'rgba(229,192,123,0.48)',
                bgcolor: 'rgba(229,192,123,0.085)',
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
              <Box>
                <Typography sx={{ color: accent, fontSize: 12, fontWeight: 780 }}>{String(index + 1).padStart(2, '0')} · {item.label}</Typography>
                <Typography sx={{ mt: 1, color: 'rgba(255,255,255,0.80)', lineHeight: 1.62, fontWeight: 700 }}>{item.value}</Typography>
              </Box>
              <CraftMetricGlyph mode={item.mode} active={selected} />
            </Box>
            <Typography sx={{ mt: 1.45, color: selected ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.42)', lineHeight: 1.7, fontSize: 13.2, transition: 'color 220ms ease' }}>
              {item.detail}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function ArchitectureGlyphLayer({ mode }: { mode: (typeof architectureNodes)[number]['mode'] }) {
  if (mode === 'relationship') {
    return (
      <Box sx={{ position: 'absolute', inset: 14, display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 160 160" width="100%" height="100%" aria-hidden="true">
          <circle cx="80" cy="80" r="64" fill="none" stroke="rgba(255,255,255,0.10)" />
          <circle cx="80" cy="80" r="48" fill="none" stroke="rgba(255,255,255,0.07)" />
          <circle cx="80" cy="80" r="31" fill="rgba(10,10,15,0.86)" stroke="rgba(255,255,255,0.10)" />
          {[
            ['80', '11', '亲近'],
            ['149', '80', '信任'],
            ['80', '149', '威胁'],
            ['11', '80', '认可'],
          ].map(([x, y, label]) => (
            <g key={label}>
              <line x1="80" y1="80" x2={x} y2={y} stroke="rgba(255,255,255,0.10)" />
              <text x={x} y={y} fill="rgba(255,255,255,0.62)" fontSize="8.5" textAnchor="middle" dominantBaseline="middle">{label}</text>
            </g>
          ))}
          <polygon points="80,28 125,71 96,130 38,88" fill="rgba(229,192,123,0.13)" stroke={accent} strokeWidth="1.6">
            <animate attributeName="points" dur="5.8s" repeatCount="indefinite" values="80,28 125,71 96,130 38,88;80,22 118,66 103,135 43,94;80,28 125,71 96,130 38,88" />
          </polygon>
        </svg>
      </Box>
    );
  }

  if (mode === 'memory') {
    return (
      <Box sx={{ position: 'absolute', inset: 12, display: 'grid', placeItems: 'center' }}>
        {[0, 1, 2, 3].map((index) => (
          <Box
            key={index}
            sx={{
              position: 'absolute',
              width: `${50 + index * 22}%`,
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              border: '1px solid rgba(229,192,123,0.18)',
              animation: 'introOrbit 9s linear infinite',
              animationDelay: `${index * -1.1}s`,
              '&::after': {
                content: '""',
                position: 'absolute',
                top: -3,
                left: '50%',
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: index === 3 ? blue : accent,
                boxShadow: '0 0 18px rgba(229,192,123,0.55)',
              },
            }}
          />
        ))}
      </Box>
    );
  }

  if (mode === 'persona') {
    return (
      <Box sx={{ position: 'absolute', inset: 20, display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 180 180" width="100%" height="100%" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="90" cy="90" r="68" fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="2 7">
            <animateTransform attributeName="transform" type="rotate" from="0 90 90" to="360 90 90" dur="26s" repeatCount="indefinite" />
          </circle>
          {[
            [90, 22],
            [158, 90],
            [90, 158],
            [22, 90],
          ].map(([x, y], index) => (
            <line key={`${x}-${y}`} x1="90" y1="90" x2={x} y2={y} stroke={index % 2 ? 'rgba(229,192,123,0.18)' : 'rgba(229,192,123,0.20)'} strokeWidth="1.2">
              <animate attributeName="stroke-opacity" dur={`${3.8 + index * 0.4}s`} repeatCount="indefinite" values="0.18;0.62;0.18" />
            </line>
          ))}
          <path d="M90 30 C123 38 146 58 151 90 C142 120 120 144 90 151 C58 142 36 122 29 90 C38 57 59 39 90 30Z" fill="rgba(229,192,123,0.08)" stroke="rgba(229,192,123,0.24)" strokeWidth="1.3">
            <animate attributeName="d" dur="7.2s" repeatCount="indefinite" values="M90 30 C123 38 146 58 151 90 C142 120 120 144 90 151 C58 142 36 122 29 90 C38 57 59 39 90 30Z;M90 26 C119 44 151 62 146 90 C150 121 118 138 90 155 C56 138 33 121 34 90 C30 58 62 44 90 26Z;M90 30 C123 38 146 58 151 90 C142 120 120 144 90 151 C58 142 36 122 29 90 C38 57 59 39 90 30Z" />
          </path>
        </svg>
        {['核心', '防御', '渴望', '语气'].map((label, index) => (
          <Box
            key={label}
            sx={{
              position: 'absolute',
              width: 42,
              height: 42,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              transform: `rotate(${index * 90}deg) translateY(-76px) rotate(${-index * 90}deg)`,
              border: '1px solid rgba(255,255,255,0.14)',
              color: index % 2 ? 'rgba(255,255,255,0.74)' : '#0A0A0F',
              bgcolor: index % 2 ? 'rgba(10,10,15,0.64)' : 'rgba(229,192,123,0.86)',
              boxShadow: index % 2 ? '0 0 18px rgba(229,192,123,0.16)' : '0 0 20px rgba(229,192,123,0.28)',
              fontSize: 11,
              fontWeight: 760,
              animation: 'personaBreath 4.8s ease-in-out infinite',
              animationDelay: `${index * 420}ms`,
            }}
          >
            {label}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'absolute', inset: 18, display: 'grid', placeItems: 'center' }}>
      {['识别', '锁定', '生成', '验收'].map((label, index) => (
        <Box
          key={label}
          sx={{
            position: 'absolute',
            left: `${8 + index * 24}%`,
            top: index % 2 === 0 ? '25%' : '62%',
            width: 42,
            height: 42,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: index === 2 ? '#0A0A0F' : 'rgba(255,255,255,0.76)',
            bgcolor: index === 2 ? accent : 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 11,
            fontWeight: 760,
            animation: 'introPulse 2.8s ease-in-out infinite',
            animationDelay: `${index * 170}ms`,
          }}
        >
          {label}
        </Box>
      ))}
    </Box>
  );
}

function ArchitectureGlyph({ mode }: { mode: (typeof architectureNodes)[number]['mode'] | null }) {
  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {architectureNodes.map((node) => {
        const active = mode !== null && node.mode === mode;
        return (
          <Box
            key={node.mode}
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: active ? 1 : 0,
              transform: active ? 'scale(1)' : 'scale(0.96)',
              filter: active ? 'blur(0px)' : 'blur(8px)',
              transition: 'opacity 420ms ease, transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 420ms ease',
            }}
          >
            <ArchitectureGlyphLayer mode={node.mode} />
          </Box>
        );
      })}
    </Box>
  );
}

function HeroVisual() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [displayedIndex, setDisplayedIndex] = useState<number | null>(null);
  const [textVisible, setTextVisible] = useState(true);
  const activeNode = activeIndex === null ? null : architectureNodes[activeIndex];
  const displayedNode = displayedIndex === null ? null : architectureNodes[displayedIndex];
  const pipeline = [
    ['择时', '让沉默与开口都有重量', '明确对象、冷场、关系压力'],
    ['成声', '让表达带着来处', '人格、记忆、情绪同场'],
    ['回落', '让每句话留下后果', '承接、修正、沉淀'],
  ];
  const detailAreaMinHeight = displayedNode ? { xs: 124, sm: 120 } : { xs: 124, sm: 120 };

  useEffect(() => {
    if (activeIndex === displayedIndex) {
      setTextVisible(true);
      return;
    }
    setTextVisible(false);
    const timer = window.setTimeout(() => {
      setDisplayedIndex(activeIndex);
      window.requestAnimationFrame(() => setTextVisible(true));
    }, 130);
    return () => window.clearTimeout(timer);
  }, [activeIndex, displayedIndex]);

  const activateNode = (index: number) => {
    setActiveIndex(index);
  };

  const resetArchitecture = () => {
    setActiveIndex(null);
  };

  return (
    <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, minHeight: { xs: 480, md: 560 }, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, border: '1px solid rgba(255,255,255,0.035)' }} />
      <Box sx={{ position: 'relative', height: '100%', display: 'grid', gridTemplateRows: 'auto auto auto', gap: { xs: 2.25, sm: 2.75 } }}>
        <Box
          onMouseLeave={resetArchitecture}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) resetArchitecture();
          }}
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}
        >
          {architectureNodes.map((node, index) => {
            const active = activeIndex !== null && index === activeIndex;
            return (
            <Box
              key={node.title}
              component="button"
              type="button"
              onMouseEnter={() => activateNode(index)}
              onFocus={() => activateNode(index)}
              onClick={() => activateNode(index)}
              sx={{
                p: 1.5,
                textAlign: 'left',
                borderRadius: 2,
                border: '1px solid',
                borderColor: active ? 'rgba(229,192,123,0.54)' : 'rgba(255,255,255,0.12)',
                bgcolor: active ? 'rgba(229,192,123,0.11)' : 'rgba(10,10,15,0.52)',
                animation: 'introFloat 5.6s ease-in-out infinite',
                animationDelay: `${index * 240}ms`,
                cursor: 'pointer',
                transition: 'border-color 220ms ease, background-color 220ms ease, transform 220ms ease',
                '&:hover, &:focus-visible': {
                  outline: 'none',
                  transform: 'translateY(-2px)',
                  borderColor: 'rgba(229,192,123,0.64)',
                  bgcolor: 'rgba(229,192,123,0.12)',
                },
              }}
            >
              <Typography sx={{ color: '#F8F8FA', fontWeight: 760, fontSize: 15 }}>{node.title}</Typography>
              <Typography sx={{ color: active ? accent : 'rgba(255,255,255,0.48)', fontSize: 12, mt: 0.5, transition: 'color 220ms ease' }}>{node.caption}</Typography>
            </Box>
            );
          })}
        </Box>

        <Box sx={{ mx: 'auto', width: { xs: 220, sm: 282 }, display: 'grid', justifyItems: 'center' }}>
        <Box
          sx={{
            width: { xs: 188, sm: 230 },
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
            border: '1px solid rgba(229,192,123,0.46)',
            bgcolor: 'rgba(255,255,255,0.035)',
            boxShadow: '0 0 80px rgba(0,0,0,0.16)',
            overflow: 'hidden',
            transition: 'box-shadow 260ms ease, border-color 260ms ease',
            animation: 'heroOrbBreath 5.8s ease-in-out infinite',
            backgroundImage: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.10), transparent 28%), radial-gradient(circle at 50% 55%, rgba(229,192,123,0.10), transparent 58%)',
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              inset: 8,
              borderRadius: '50%',
              border: '2px solid rgba(229,192,123,0.36)',
              opacity: 0,
              transform: 'scale(0.58)',
              pointerEvents: 'none',
              zIndex: 0,
              animation: 'heroOrbWave 4.2s ease-out infinite',
            },
            '&::after': {
              inset: 26,
              borderColor: 'rgba(255,255,255,0.24)',
              animationDelay: '1.35s',
              animationDuration: '4.9s',
            },
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              inset: 4,
              borderRadius: '50%',
              background: 'conic-gradient(from 20deg, transparent 0deg, rgba(229,192,123,0.20) 54deg, transparent 118deg, rgba(255,255,255,0.14) 188deg, transparent 260deg, rgba(229,192,123,0.16) 326deg, transparent 360deg)',
              filter: 'blur(1px)',
              opacity: 0.72,
              animation: 'heroOrbSpin 13s linear infinite',
              zIndex: 0,
            }}
          />
          <ArchitectureGlyph mode={activeNode?.mode ?? null} />
          <Box sx={{ position: 'absolute', inset: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.10)' }} />
          <Box
            sx={{
              position: 'relative',
              zIndex: 2,
              width: { xs: 136, sm: 166 },
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              px: 1,
              bgcolor: 'rgba(10,10,15,0.82)',
              border: '1px solid rgba(255,255,255,0.11)',
              boxShadow: '0 0 36px rgba(10,10,15,0.64)',
              opacity: displayedNode ? 0 : 1,
              transform: displayedNode ? 'scale(0.92)' : 'scale(1)',
              transition: 'opacity 260ms ease, transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
          >
            <Box
              sx={{
                width: '100%',
                display: 'grid',
                justifyItems: 'center',
                textAlign: 'center',
                opacity: textVisible ? 1 : 0,
                transform: textVisible ? 'translateY(0)' : 'translateY(4px)',
                transition: 'opacity 220ms ease, transform 220ms ease',
              }}
            >
            <Typography sx={{ width: '100%', color: '#F8F8FA', fontWeight: 820, fontSize: { xs: 22, sm: 27 }, lineHeight: 1, letterSpacing: 0, textAlign: 'center', whiteSpace: 'nowrap' }}>Sense Murmur</Typography>
            <Typography sx={{ width: '100%', color: accent, fontSize: 12, lineHeight: 1.15, mt: 0.75, letterSpacing: 1.8, textIndent: '1.8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {displayedNode?.caption ?? 'AI Chat Group'}
            </Typography>
            </Box>
          </Box>
        </Box>
        </Box>

        <Box sx={{ position: 'relative', minHeight: detailAreaMinHeight, transition: 'min-height 340ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.75, sm: 1 }, opacity: displayedNode ? 0 : 1, transform: displayedNode ? 'translateY(8px)' : 'translateY(0)', pointerEvents: displayedNode ? 'none' : 'auto', transition: 'opacity 260ms ease, transform 300ms ease' }}>
            {pipeline.map(([title, summary, detail], index) => (
              <Box
                key={title}
                sx={{
                  p: { xs: 1.05, sm: 1.2 },
                  borderRadius: 1.5,
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.72)',
                  bgcolor: 'rgba(255,255,255,0.035)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ position: 'absolute', inset: 0, bgcolor: index === 1 ? 'rgba(229,192,123,0.08)' : 'transparent' }} />
                <Box sx={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: { xs: 'center', sm: 'flex-start' }, alignItems: { xs: 'center', sm: 'stretch' }, textAlign: { xs: 'center', sm: 'left' }, pb: { xs: 0, sm: 0 } }}>
                  <Box>
                    <Typography sx={{ color: accent, fontSize: { xs: 20, sm: 14 }, fontWeight: 860, letterSpacing: { xs: 1.4, sm: 1.1 }, lineHeight: 1 }}>{String(index + 1).padStart(2, '0')}</Typography>
                    <Typography sx={{ mt: { xs: 1.45, sm: 0.48 }, fontSize: { xs: 17, sm: 15 }, fontWeight: 780, color: '#F8F8FA', lineHeight: { xs: 1.18, sm: 1.34 } }}>{title}</Typography>
                  </Box>
                  <Typography sx={{ mt: { xs: 1.65, sm: 0.6 }, mb: { xs: 0, sm: 0 }, fontSize: { xs: 11.6, sm: 12.5 }, lineHeight: 1.5, color: 'rgba(255,255,255,0.70)' }}>{summary}</Typography>
                  <Typography sx={{ mt: 0.45, fontSize: 11.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.42)', display: { xs: 'none', md: 'block' } }}>{detail}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              p: { xs: 1.35, sm: 1.6 },
              borderRadius: 1.5,
              border: '1px solid rgba(255,255,255,0.10)',
              bgcolor: 'rgba(10,10,15,0.48)',
              backdropFilter: 'blur(14px)',
              opacity: displayedNode ? 1 : 0,
              transform: displayedNode ? 'translateY(0)' : 'translateY(8px)',
              pointerEvents: displayedNode ? 'auto' : 'none',
              transition: 'opacity 260ms ease, transform 300ms ease, border-color 220ms ease, background-color 220ms ease',
            }}
          >
            {displayedNode ? (
            <Box sx={{ height: '100%', display: 'grid', alignContent: { xs: 'start', sm: 'center' }, opacity: textVisible ? 1 : 0, transform: textVisible ? 'translateY(0)' : 'translateY(5px)', transition: 'opacity 220ms ease, transform 220ms ease' }}>
            <Typography sx={{ color: accent, fontWeight: 780, fontSize: 13 }}>{displayedNode.title}</Typography>
            <Typography sx={{ mt: 0.65, color: 'rgba(255,255,255,0.66)', fontSize: { xs: 13, sm: 14 }, lineHeight: 1.65 }}>{displayedNode.summary}</Typography>
            <Stack direction="row" spacing={0.65} sx={{ mt: 1.1, flexWrap: 'wrap', gap: 0.65 }}>
              {displayedNode.facets.map((facet) => (
                <Chip key={facet} size="small" label={facet} sx={{ height: 22, color: 'rgba(255,255,255,0.72)', bgcolor: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.10)', '& .MuiChip-label': { px: 0.85, fontSize: 11 } }} />
              ))}
            </Stack>
            </Box>
            ) : null}
          </Box>
        </Box>
      </Box>
    </GlassCard>
  );
}

const introHeroTitle = '生息：Sense Murmur';
const finalHeroTitleLead = '不是活着，是被';
const finalHeroTitleEmphasis = '活过';
const finalHeroTitle = `${finalHeroTitleLead}${finalHeroTitleEmphasis}`;

function AnimatedHeroTitle() {
  const [text, setText] = useState(introHeroTitle);
  const [titleMode, setTitleMode] = useState<'intro' | 'final'>('intro');
  const [fadingIndex, setFadingIndex] = useState<number | null>(null);
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    let currentText = introHeroTitle;

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
    };

    const typeFinalTitle = (index = 0, nextText = '') => {
      if (index >= finalHeroTitle.length) {
        setShowCursor(false);
        return;
      }
      const updatedText = nextText + finalHeroTitle[index];
      setText(updatedText);
      if (index + 1 === finalHeroTitleLead.length) setShowCursor(false);
      const nextDelay = index + 1 === finalHeroTitleLead.length ? 350 : 200;
      schedule(() => typeFinalTitle(index + 1, updatedText), nextDelay);
    };

    const deleteIntroTitle = () => {
      if (currentText.length === 0) {
        setFadingIndex(null);
        setTitleMode('final');
        schedule(() => typeFinalTitle(), 1500);
        return;
      }

      const nextFadingIndex = currentText.length - 1;
      setFadingIndex(nextFadingIndex);
      schedule(() => {
        currentText = currentText.slice(0, -1);
        setText(currentText);
        setFadingIndex(null);
        schedule(deleteIntroTitle, 120);
      }, 80);
    };

    schedule(() => setShowCursor(true), 2000);
    schedule(deleteIntroTitle, 3000);
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const renderCursor = () => showCursor ? (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: 'inline-block',
        width: { xs: 3, md: 4 },
        height: '0.82em',
        ml: 0.55,
        transform: 'translateY(0.08em)',
        bgcolor: accent,
        animation: 'titleCursorBlink 760ms steps(2, start) infinite',
      }}
    />
  ) : (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: 'inline-block',
        width: { xs: 3, md: 4 },
        height: '0.82em',
        ml: 0.55,
        opacity: 0,
      }}
    />
  );

  const renderChars = (value: string, options: { size: number | { xs: number; sm?: number; md: number }; baseIndex?: number; bigChars?: boolean }) => Array.from(value).map((char, index) => {
    const absoluteIndex = (options.baseIndex ?? 0) + index;
    return (
      <Box
        key={`${titleMode}-${char}-${absoluteIndex}`}
        component="span"
        sx={{
          display: 'inline-block',
          opacity: titleMode === 'intro' && fadingIndex === absoluteIndex ? 0 : 1,
          transform: titleMode === 'intro' && fadingIndex === absoluteIndex ? 'translateY(3px)' : 'translateY(0)',
          transition: 'opacity 80ms ease, transform 80ms ease',
          whiteSpace: char === ' ' ? 'pre' : 'normal',
          fontSize: options.bigChars && char !== '。' ? { xs: 52, md: 76 } : options.size,
          lineHeight: options.bigChars && char !== '。' ? 0.92 : 1.04,
        }}
      >
        {char}
      </Box>
    );
  });

  const finalLeadText = titleMode === 'final' ? text.slice(0, finalHeroTitleLead.length) : '';
  const finalEmphasisText = titleMode === 'final' ? text.slice(finalHeroTitleLead.length) : '';
  const introSize = { xs: 38, sm: 44, md: 48 };
  const leadSize = { xs: 33, sm: 42, md: 48 };

  return (
    <Box
      component="h1"
      aria-live="polite"
      sx={{
        width: '100%',
        maxWidth: { xs: 760, lg: 900 },
        minWidth: 0,
        minHeight: { xs: 132, md: 164 },
        m: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontWeight: 850,
        letterSpacing: 0,
        color: '#F8F8FA',
        overflow: 'visible',
      }}
    >
      {titleMode === 'intro' ? (
        <Box component="span" sx={{ maxWidth: '100%', whiteSpace: 'nowrap', fontSize: introSize, lineHeight: 1.04 }}>
          {renderChars(text, { size: introSize })}
          {renderCursor()}
        </Box>
      ) : (
        <>
          <Box component="span" sx={{ maxWidth: '100%', whiteSpace: 'nowrap', fontSize: leadSize, lineHeight: 1.04 }}>
            {renderChars(finalLeadText, { size: leadSize })}
            {text.length <= finalHeroTitleLead.length ? renderCursor() : null}
          </Box>
          <Box component="span" sx={{ mt: 0.35, maxWidth: '100%', whiteSpace: 'nowrap', color: accent }}>
            {renderChars(finalEmphasisText, { size: leadSize, baseIndex: finalHeroTitleLead.length, bigChars: true })}
            {text.length > finalHeroTitleLead.length ? renderCursor() : null}
          </Box>
        </>
      )}
    </Box>
  );
}

const productHeroTags = ['多角色房间', '朋友圈动态', '活动日历', '助手 Agent', '模型中转站', '长期记忆'];

const productPrimaryActions = [
  { label: '创建角色', path: '/characters/create', icon: <PersonAddAlt1Icon /> },
  { label: '开始房间', path: '/chats/create', icon: <ForumOutlinedIcon /> },
  { label: '看朋友圈', path: '/moments', icon: <DynamicFeedIcon /> },
  { label: '打开日历', path: '/calendar', icon: <CalendarMonthIcon /> },
];

const productFeatures = [
  {
    icon: <ForumOutlinedIcon />,
    title: '多角色房间',
    text: '创建群聊、单聊和 AI 私聊，让角色在同一段时间里插话、沉默、站边和形成关系。',
    route: '/chats/create',
    cta: '开始房间',
  },
  {
    icon: <DynamicFeedIcon />,
    title: '朋友圈动态',
    text: '角色会根据经历、人设节律和关系余波发布动态，可承载随手记录、内心小记和图文内容。',
    route: '/moments',
    cta: '查看动态',
  },
  {
    icon: <CalendarMonthIcon />,
    title: '活动日历',
    text: '约定、活动、提醒和冲突修正进入统一日程，角色的生活不只停在聊天框里。',
    route: '/calendar',
    cta: '打开日历',
  },
  {
    icon: <ExtensionIcon />,
    title: '助手 Agent',
    text: '在助手会话里规划任务、生成产物、保留版本，沉淀文档、代码、图表、HTML 和数据文件。',
    route: '/chats/create',
    cta: '创建助手',
  },
  {
    icon: <KeyIcon />,
    title: '模型中转站',
    text: '统一管理模型供应商、Key、额度和 API 转发能力，让不同模型进入同一套使用边界。',
    route: '/ai-proxy',
    cta: '配置中转',
  },
  {
    icon: <MemoryIcon />,
    title: '长期记忆',
    text: '记住的不只是事实，还有共同经历、关系裂痕、秘密、约定、称呼和角色成长。',
    route: '/characters',
    cta: '查看角色',
  },
];

const productDifferences = [
  {
    title: '角色不是每次重置',
    text: '同一个角色会带着旧关系和旧记忆进入新房间。群聊里的经历会改变单聊语气，私密线程的余波也会影响公开场合。',
  },
  {
    title: '关系会改变行为',
    text: '亲近、信任、防备、威胁感不会只停在数值上，它们会改变角色是否护短、拆台、回避、补台或主动靠近。',
  },
  {
    title: '用户理解有边界',
    text: '角色会记住你的节奏、偏好、共同话语和约定，但公开动态、私密内容和角色视角会按可见性分层裁剪。',
  },
];

const worldSignals = [
  ['群聊事件', '一次争执、维护、玩笑或约定'],
  ['关系余波', '亲近、防备、误会、和解继续沉淀'],
  ['世界投影', '朋友圈、日历、提醒和日记自然长出来'],
];

const orbitNodes = [
  { label: '房间', detail: '群聊 / 单聊 / AI 私聊', angle: -90, icon: <ForumOutlinedIcon /> },
  { label: '朋友圈', detail: '动态 / 图文 / 余味', angle: -25, icon: <DynamicFeedIcon /> },
  { label: '日历', detail: '活动 / 约定 / 提醒', angle: 35, icon: <CalendarMonthIcon /> },
  { label: 'Agent', detail: '任务 / 产物 / 版本', angle: 100, icon: <ExtensionIcon /> },
  { label: '中转站', detail: '模型 / Key / API', angle: 170, icon: <KeyIcon /> },
  { label: '长期记忆', detail: '经历 / 关系 / 成长', angle: 230, icon: <MemoryIcon /> },
];

function ProductShellCard({ children, sx = {} }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={(theme) => ({
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.70 : 0.82),
        borderRadius: 2,
        boxShadow: theme.palette.mode === 'dark' ? '0 18px 50px rgba(0,0,0,0.28)' : '0 18px 48px rgba(15,23,42,0.08)',
        backdropFilter: 'blur(18px) saturate(1.08)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.08)',
        ...sx,
      })}
    >
      {children}
    </Box>
  );
}

function ProductOrbitVisual() {
  return (
    <ProductShellCard sx={{ p: { xs: 2, sm: 2.5 }, minHeight: { xs: 520, sm: 560, md: 620 }, overflow: 'hidden', position: 'relative' }}>
      <Box
        aria-hidden
        sx={(theme) => ({
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, transparent 44%, ${alpha(theme.palette.secondary.main, 0.10)})`,
        })}
      />
      <Box sx={{ position: 'relative', height: '100%', minHeight: { xs: 480, sm: 520, md: 580 }, display: 'grid', placeItems: 'center' }}>
        <Box
          aria-hidden
          sx={(theme) => ({
            position: 'absolute',
            width: { xs: 250, sm: 330, md: 390 },
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.28),
            animation: 'productOrbitSpin 28s linear infinite',
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              inset: { xs: 42, sm: 56 },
              borderRadius: '50%',
              border: '1px solid',
              borderColor: alpha(theme.palette.secondary.main, 0.18),
            },
            '&::after': {
              inset: { xs: 82, sm: 110 },
              borderColor: alpha(theme.palette.warning.main, 0.20),
            },
          })}
        />
        <Box
          sx={(theme) => ({
            zIndex: 2,
            width: { xs: 150, sm: 172 },
            aspectRatio: '1 / 1',
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.38),
            bgcolor: alpha(theme.palette.surface.main, theme.palette.mode === 'dark' ? 0.70 : 0.88),
            boxShadow: `0 22px 70px ${alpha(theme.palette.primary.main, 0.20)}`,
            transform: 'rotate(-2deg)',
          })}
        >
          <Stack spacing={0.9} sx={{ alignItems: 'center' }}>
            <Box
              sx={(theme) => ({
                width: 44,
                height: 44,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                color: theme.palette.primary.contrastText,
                bgcolor: 'primary.main',
              })}
            >
              <PsychologyIcon />
            </Box>
            <Typography sx={{ fontWeight: 850, fontSize: 20, color: 'text.primary', lineHeight: 1.15 }}>角色实例</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 12.5, lineHeight: 1.45 }}>关系、记忆、情绪和成长汇到同一个角色身上</Typography>
          </Stack>
        </Box>
        {orbitNodes.map((node, index) => {
          const radius = 42;
          const x = 50 + Math.cos((node.angle * Math.PI) / 180) * radius;
          const y = 50 + Math.sin((node.angle * Math.PI) / 180) * radius;
          return (
            <Box
              key={node.label}
              sx={(theme) => ({
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                width: { xs: 120, sm: 140 },
                minHeight: 86,
                transform: 'translate(-50%, -50%)',
                p: 1.25,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, index % 2 ? 0.24 : 0.34),
                bgcolor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.76 : 0.90),
                boxShadow: theme.palette.mode === 'dark' ? '0 14px 36px rgba(0,0,0,0.24)' : '0 14px 34px rgba(15,23,42,0.08)',
                animation: 'productNodeBreathe 4.8s ease-in-out infinite',
                animationDelay: `${index * 180}ms`,
              })}
            >
              <Stack direction="row" spacing={0.8} sx={{ alignItems: 'center' }}>
                <Box sx={{ color: index % 2 ? 'secondary.main' : 'primary.main', display: 'grid', '& svg': { fontSize: 19 } }}>{node.icon}</Box>
                <Typography sx={{ color: 'text.primary', fontWeight: 800, fontSize: 14 }}>{node.label}</Typography>
              </Stack>
              <Typography sx={{ mt: 0.8, color: 'text.secondary', fontSize: 12, lineHeight: 1.45 }}>{node.detail}</Typography>
            </Box>
          );
        })}
      </Box>
    </ProductShellCard>
  );
}

function ProductFeatureCard({ item }: { item: (typeof productFeatures)[number] }) {
  const navigate = useNavigate();
  return (
    <ProductShellCard
      sx={{
        p: 2,
        minHeight: 226,
        display: 'flex',
        flexDirection: 'column',
        transition: `transform ${motion.durations.base}ms ${motion.softOut}, border-color ${motion.durations.base}ms ${motion.softOut}, box-shadow ${motion.durations.base}ms ${motion.softOut}`,
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: 'primary.main',
        },
      }}
    >
      <Box
        sx={(theme) => ({
          width: 42,
          height: 42,
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.10),
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.22),
          '& svg': { fontSize: 23 },
        })}
      >
        {item.icon}
      </Box>
      <Typography sx={{ mt: 1.6, color: 'text.primary', fontWeight: 830, fontSize: 21, lineHeight: 1.18 }}>{item.title}</Typography>
      <Typography sx={{ mt: 1.1, color: 'text.secondary', lineHeight: 1.72, fontSize: 14.5, flex: 1 }}>{item.text}</Typography>
      <Button
        size="small"
        endIcon={<ArrowForwardIcon />}
        onClick={() => navigate(item.route)}
        sx={{ mt: 1.8, alignSelf: 'flex-start', borderRadius: 1.5, px: 1.25, color: 'primary.main', fontWeight: 760 }}
      >
        {item.cta}
      </Button>
    </ProductShellCard>
  );
}

function WorldSurfacePreview() {
  return (
    <ProductShellCard sx={{ p: { xs: 1.5, md: 2 }, overflow: 'hidden' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.94fr 1.06fr' }, gap: 1.5 }}>
        <Box sx={{ display: 'grid', gap: 1.1 }}>
          {[
            ['阿晚', '今天的晚风有点像昨天那句没说完的话。'],
            ['老李', '活动改到周六，记得提前半小时出门。'],
            ['涩涩', '不解释，反正有人懂。'],
          ].map(([name, text], index) => (
            <Box
              key={name}
              sx={(theme) => ({
                p: 1.35,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(index === 1 ? theme.palette.secondary.main : theme.palette.primary.main, 0.18),
                bgcolor: alpha(theme.palette.surface.main, theme.palette.mode === 'dark' ? 0.45 : 0.76),
                animation: 'productSignalRise 5.4s ease-in-out infinite',
                animationDelay: `${index * 420}ms`,
              })}
            >
              <Typography sx={{ color: 'text.primary', fontWeight: 780, fontSize: 14 }}>{name} 的朋友圈</Typography>
              <Typography sx={{ mt: 0.6, color: 'text.secondary', fontSize: 13.5, lineHeight: 1.58 }}>{text}</Typography>
            </Box>
          ))}
        </Box>
        <Box
          sx={(theme) => ({
            p: 1.4,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, theme.palette.mode === 'dark' ? 0.36 : 0.52),
          })}
        >
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ color: 'text.primary', fontWeight: 820 }}>活动日历</Typography>
            <Chip size="small" label="本周" sx={{ height: 22, borderRadius: 1.2 }} />
          </Stack>
          <Stack spacing={1} sx={{ mt: 1.3 }}>
            {[
              ['今天 21:30', '群聊复盘', '从刚才的争执里收束关系余波'],
              ['周六 15:00', '咖啡馆约定', '共享日程，提前提醒'],
              ['下周一', '任务交付', 'Agent 产物版本检查'],
            ].map(([time, title, note]) => (
              <Box key={title} sx={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', gap: 1.2, alignItems: 'start' }}>
                <Typography sx={{ color: 'primary.main', fontSize: 12, fontWeight: 780 }}>{time}</Typography>
                <Box>
                  <Typography sx={{ color: 'text.primary', fontSize: 13.5, fontWeight: 760 }}>{title}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 12.5, lineHeight: 1.45 }}>{note}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Box>
    </ProductShellCard>
  );
}

function ProductIntroPage() {
  const navigate = useNavigate();
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: '100%',
        color: 'text.primary',
        px: { xs: 2, sm: 2.5, lg: 4 },
        pt: { xs: 1.5, md: 3 },
        pb: { xs: 10, md: 7 },
        ...reducedMotionDescendantSx,
        '@keyframes productOrbitSpin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        '@keyframes productNodeBreathe': {
          '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.88 },
          '50%': { transform: 'translate(-50%, -50%) scale(1.035)', opacity: 1 },
        },
        '@keyframes productSignalRise': {
          '0%, 100%': { transform: 'translateY(0)', opacity: 0.86 },
          '50%': { transform: 'translateY(-3px)', opacity: 1 },
        },
      }}
    >
      <Box sx={{ width: 'min(1160px, 100%)', mx: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 0.96fr) minmax(0, 1.04fr)' }, gap: { xs: 3, lg: 5 }, alignItems: 'center', minHeight: { lg: 'calc(100dvh - 150px)' }, pb: { xs: 4, md: 6 } }}>
          <Reveal>
            <Box>
              <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.8, mb: 3 }}>
                {productHeroTags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{
                      borderRadius: 1.4,
                      height: 28,
                      bgcolor: alpha(theme.palette.primary.main, 0.09),
                      color: 'text.primary',
                      border: '1px solid',
                      borderColor: alpha(theme.palette.primary.main, 0.18),
                      '& .MuiChip-label': { px: 1, fontWeight: 680 },
                    }}
                  />
                ))}
              </Stack>
              <Typography component="h1" sx={{ m: 0, maxWidth: 760, fontWeight: 880, letterSpacing: 0, lineHeight: { xs: 1.08, md: 1.04 }, fontSize: { xs: 38, sm: 52, md: 68 } }}>
                让 AI 角色在房间、动态和日程里持续生活
              </Typography>
              <Typography sx={{ mt: 2.4, maxWidth: 720, color: 'text.secondary', fontSize: { xs: 16, md: 18 }, lineHeight: 1.78 }}>
                Sense Murmur 是一个 AI 角色互动平台。你可以创建角色，把他们放进群聊、单聊、AI 私聊和任务场景里；角色会记住共同经历、理解关系变化，并在朋友圈、日历和主动关怀中留下持续的世界回声。
              </Typography>
              <Stack direction="row" spacing={1.1} sx={{ mt: 3.4, flexWrap: 'wrap', gap: 1.1 }}>
                {productPrimaryActions.map((action, index) => (
                  <Button
                    key={action.label}
                    variant={index === 0 ? 'contained' : 'outlined'}
                    startIcon={action.icon}
                    onClick={() => navigate(action.path)}
                    sx={{
                      borderRadius: 1.6,
                      px: 2,
                      py: 1.1,
                      fontWeight: 800,
                      boxShadow: 'none',
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          </Reveal>
          <Reveal delay={120}>
            <ProductOrbitVisual />
          </Reveal>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 } }}>
          <Reveal>
            <Typography sx={{ color: 'primary.main', fontWeight: 820, fontSize: 13, letterSpacing: 1.2 }}>PRODUCT SURFACES</Typography>
            <Typography component="h2" sx={{ mt: 1, color: 'text.primary', fontWeight: 860, fontSize: { xs: 30, md: 44 }, lineHeight: 1.12 }}>打开以后，你能马上使用这些能力</Typography>
          </Reveal>
          <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {productFeatures.map((item, index) => (
              <Reveal key={item.title} delay={index * 45}>
                <ProductFeatureCard item={item} />
              </Reveal>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.82fr 1.18fr' }, gap: { xs: 2.5, md: 4 }, alignItems: 'center' }}>
          <Reveal>
            <Box>
              <Typography sx={{ color: 'primary.main', fontWeight: 820, fontSize: 13, letterSpacing: 1.2 }}>WORLD RUNTIME</Typography>
              <Typography component="h2" sx={{ mt: 1, color: 'text.primary', fontWeight: 860, fontSize: { xs: 30, md: 44 }, lineHeight: 1.12 }}>角色不只存在于聊天框</Typography>
              <Typography sx={{ mt: 1.7, color: 'text.secondary', fontSize: 16, lineHeight: 1.78 }}>
                群聊里的事件会进入世界运行层，经过关系余波和可见性裁剪，变成朋友圈动态、活动日历、提醒、日记材料或下一次主动关怀。
              </Typography>
              <Stack spacing={1.1} sx={{ mt: 2.4 }}>
                {worldSignals.map(([title, text]) => (
                  <ProductShellCard key={title} sx={{ p: 1.45, boxShadow: 'none' }}>
                    <Typography sx={{ color: 'text.primary', fontWeight: 800 }}>{title}</Typography>
                    <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 13.5 }}>{text}</Typography>
                  </ProductShellCard>
                ))}
              </Stack>
            </Box>
          </Reveal>
          <Reveal delay={110}>
            <WorldSurfacePreview />
          </Reveal>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 } }}>
          <Reveal>
            <ProductShellCard sx={{ p: { xs: 2.2, md: 3 }, overflow: 'hidden', position: 'relative' }}>
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(120deg, ${alpha(theme.palette.primary.main, 0.10)}, transparent 40%, ${alpha(theme.palette.warning.main, 0.10)})`,
                }}
              />
              <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.86fr 1.14fr' }, gap: { xs: 3, md: 4 }, alignItems: 'start' }}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <BoltIcon sx={{ color: 'primary.main' }} />
                    <Typography sx={{ color: 'primary.main', fontWeight: 820, fontSize: 13, letterSpacing: 1.2 }}>AGENT & TRANSIT</Typography>
                  </Stack>
                  <Typography component="h2" sx={{ mt: 1.3, color: 'text.primary', fontWeight: 860, fontSize: { xs: 30, md: 44 }, lineHeight: 1.12 }}>聊天保持轻量，任务交给 Agent</Typography>
                  <Typography sx={{ mt: 1.7, color: 'text.secondary', fontSize: 16, lineHeight: 1.78 }}>
                    普通助手会话不背负重型产物能力。开启 Agent 后，再进入规划、生成、校验、预览和版本管理；中转站负责模型接入、Key 管理和 API 转发。
                  </Typography>
                  <Stack direction="row" spacing={1.1} sx={{ mt: 2.6, flexWrap: 'wrap', gap: 1.1 }}>
                    <Button variant="contained" startIcon={<ExtensionIcon />} onClick={() => navigate('/chats/create')} sx={{ borderRadius: 1.6, fontWeight: 800, boxShadow: 'none' }}>创建助手</Button>
                    <Button variant="outlined" startIcon={<KeyIcon />} onClick={() => navigate('/ai-proxy')} sx={{ borderRadius: 1.6, fontWeight: 800 }}>打开中转站</Button>
                  </Stack>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.2 }}>
                  {[
                    ['规划', '先判断是普通聊天、创建产物、更新产物还是需要澄清。'],
                    ['生成', '输出 Markdown、代码、图表源码、HTML、JSON、CSV 等产物。'],
                    ['校验', '提交前检查目标、版本基线和产物结构，避免直接覆盖。'],
                    ['接入', '通过中转站管理模型供应商、Key、额度和外部 API。'],
                  ].map(([title, text]) => (
                    <ProductShellCard key={title} sx={{ p: 1.7, boxShadow: 'none' }}>
                      <TaskAltIcon sx={{ color: 'secondary.main', fontSize: 22 }} />
                      <Typography sx={{ mt: 1, color: 'text.primary', fontWeight: 820, fontSize: 18 }}>{title}</Typography>
                      <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: 13.5, lineHeight: 1.62 }}>{text}</Typography>
                    </ProductShellCard>
                  ))}
                </Box>
              </Box>
            </ProductShellCard>
          </Reveal>
        </Box>

        <Box sx={{ py: { xs: 4, md: 6 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.92fr 1.08fr' }, gap: { xs: 2.2, md: 3.5 }, alignItems: 'start' }}>
          <Reveal>
            <Box>
              <Typography sx={{ color: 'primary.main', fontWeight: 820, fontSize: 13, letterSpacing: 1.2 }}>SOUL CONTINUITY</Typography>
              <Typography component="h2" sx={{ mt: 1, color: 'text.primary', fontWeight: 860, fontSize: { xs: 30, md: 44 }, lineHeight: 1.12 }}>真正的特色，是角色会带着关系继续存在</Typography>
              <Typography sx={{ mt: 1.7, color: 'text.secondary', fontSize: 16, lineHeight: 1.78 }}>
                Sense Murmur 的长期价值不是更多入口，而是这些入口都指向同一个角色实例：它会理解你，记住旧事，也知道哪些内容只能停留在私域。
              </Typography>
            </Box>
          </Reveal>
          <Stack spacing={1.2}>
            {productDifferences.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <ProductShellCard sx={{ p: { xs: 1.8, md: 2.1 }, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '44px minmax(0, 1fr)' }, gap: 1.4, alignItems: 'start', boxShadow: 'none' }}>
                  <Box sx={(item.title.includes('边界') ? { color: 'secondary.main' } : { color: 'primary.main' })}>
                    {item.title.includes('边界') ? <ShieldOutlinedIcon /> : item.title.includes('关系') ? <HubIcon /> : <MemoryIcon />}
                  </Box>
                  <Box>
                    <Typography sx={{ color: 'text.primary', fontWeight: 820, fontSize: 19 }}>{item.title}</Typography>
                    <Typography sx={{ mt: 0.7, color: 'text.secondary', fontSize: 14.5, lineHeight: 1.72 }}>{item.text}</Typography>
                  </Box>
                </ProductShellCard>
              </Reveal>
            ))}
          </Stack>
        </Box>

        <Reveal>
          <ProductShellCard sx={{ mt: { xs: 2, md: 4 }, p: { xs: 2.3, md: 3 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center' }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <AutoStoriesIcon sx={{ color: 'primary.main' }} />
                <Typography sx={{ color: 'primary.main', fontWeight: 820, fontSize: 13, letterSpacing: 1.2 }}>CONCEPT NOTE</Typography>
              </Stack>
              <Typography sx={{ mt: 1, color: 'text.primary', fontWeight: 850, fontSize: { xs: 25, md: 34 }, lineHeight: 1.18 }}>为什么我们说角色应该有“来处”？</Typography>
              <Typography sx={{ mt: 1, color: 'text.secondary', lineHeight: 1.75 }}>
                如果你想了解角色连续性、关系余波和记忆设计背后的概念，可以继续阅读概念篇。新的介绍页负责讲清产品，概念篇负责解释 Sense Murmur 的气质。
              </Typography>
            </Box>
            <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/intro/concept')} sx={{ justifySelf: { xs: 'start', md: 'end' }, borderRadius: 1.6, px: 2.2, py: 1.1, fontWeight: 800 }}>
              阅读概念篇
            </Button>
          </ProductShellCard>
        </Reveal>
      </Box>
    </Box>
  );
}

const ink = '#211B16';
const paper = '#F7EFE1';
const paperDeep = '#E7D5B7';
const amber = '#D97925';
const amberDeep = '#A84E12';
const sand = '#C7A56A';
const charcoal = '#24211D';
const seam = '#2F261E';
const craftShadow = `7px 7px 0 ${seam}`;
const craftShadowDeep = `11px 11px 0 ${seam}`;
const serifStack = 'Fraunces, "Cormorant Garamond", "Noto Serif SC", Georgia, serif';
const monoStack = '"Roboto Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace';

const craftModules = [
  {
    key: 'agent',
    label: 'Agent 工作流',
    title: '把一句需求变成可验收的产物',
    text: 'Planner 判断目标，Writer 生成 patch set，Validator 校验版本与结构，再沉淀为文档、代码、图表、HTML 或数据文件。',
    emphasis: '旗舰能力',
    icon: <ExtensionIcon />,
  },
  {
    key: 'rooms',
    label: '互动房间',
    title: '角色不是排队回复，而是在同一空间里相处',
    text: '群聊、单聊、AI 私聊共享角色实例。公开和私密视角不同，但关系与经历会回到同一条主链。',
    emphasis: '角色入口',
    icon: <ForumOutlinedIcon />,
  },
  {
    key: 'memory',
    label: '长期记忆',
    title: '记住经历，而不是摘抄聊天',
    text: '共同经历、关系裂痕、秘密、约定、称呼和成长结论会被分层沉淀，并影响下一次表达。',
    emphasis: '护城河',
    icon: <MemoryIcon />,
  },
  {
    key: 'transit',
    label: '模型中转站',
    title: '把模型接入变成可治理能力',
    text: '统一管理供应商、Key、额度和外部 API 转发，让模型能力进入同一套会员与使用边界。',
    emphasis: '基础设施',
    icon: <KeyIcon />,
  },
] as const;

const agentSteps = [
  ['ORCH', '判断', '普通聊天、创建产物、更新产物或澄清问题'],
  ['PLAN', '规划', '锁定目标范围、操作类型、置信度和版本基线'],
  ['WRITE', '生成', '输出 Markdown、代码、图表、HTML、JSON、CSV 等 patch'],
  ['CHECK', '校验', '检查目标、结构和版本，不直接覆盖已有产物'],
  ['SHIP', '沉淀', '进入产物面板、版本记录、预览和下载链路'],
];

const craftFacts = [
  ['角色连续性', '同一个角色跨房间保持人格、关系、记忆和情绪。'],
  ['关系账本', '亲近、信任、防备、威胁感会改变角色行为。'],
  ['世界回声', '朋友圈和日历轻量承接事件余波，不抢主线。'],
  ['可见性', '公开、用户私域、角色私密线程按视角裁剪。'],
];

const craftFaq = [
  ['它和普通 AI 聊天有什么不同？', '普通聊天重在即时回答。Sense Murmur 重在角色连续性：房间、记忆、关系、Agent 产物都服务于同一个长期存在的角色世界。'],
  ['朋友圈和日历是核心吗？', '它们是世界表面，不是主卖点。它们让角色的生活痕迹自然外显，但介绍页只轻带，主线仍然是角色连续性和 Agent。'],
  ['Agent 为什么重要？', '因为它把聊天里的想法推进成可沉淀、可修改、可校验的产物，而不是把结果丢在一次性消息里。'],
];

function WavyUnderline({ width = 180 }: { width?: number }) {
  return (
    <Box component="svg" viewBox={`0 0 ${width} 18`} aria-hidden sx={{ display: 'block', width, maxWidth: '100%', height: 18 }}>
      <path d={`M4 9 C 22 0, 36 18, 54 9 S 88 9, 106 9 S 140 9, ${width - 4} 9`} fill="none" stroke={amber} strokeWidth="4" strokeLinecap="round" />
    </Box>
  );
}

function EightPointStar({ size = 26, sx = {} }: { size?: number; sx?: object }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      aria-hidden
      sx={{ width: size, height: size, color: amber, ...sx }}
    >
      <path d="M16 2 L18.7 12.1 L30 16 L18.7 19.9 L16 30 L13.3 19.9 L2 16 L13.3 12.1 Z" fill="currentColor" />
      <path d="M16 7 L17.5 13.8 L24 16 L17.5 18.2 L16 25 L14.5 18.2 L8 16 L14.5 13.8 Z" fill={paper} />
    </Box>
  );
}

function TicketLabel({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.15,
        py: 0.55,
        border: '1.5px solid',
        borderColor: dark ? paper : ink,
        bgcolor: dark ? amber : '#FFF8EA',
        color: dark ? ink : ink,
        fontFamily: monoStack,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        boxShadow: dark ? `4px 4px 0 ${paper}` : `4px 4px 0 ${sand}`,
        transform: 'rotate(-1deg)',
      }}
    >
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dark ? ink : amber }} />
      {children}
    </Box>
  );
}

function DashedRing({ sx = {} }: { sx?: object }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 120 120"
      aria-hidden
      sx={{ position: 'absolute', width: 120, height: 120, color: amber, ...sx }}
    >
      <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 7" />
      <circle cx="60" cy="60" r="17" fill="none" stroke={ink} strokeWidth="2" />
    </Box>
  );
}

function CraftPanel({ children, sx = {} }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        border: `2px solid ${ink}`,
        bgcolor: '#FFF8EA',
        boxShadow: craftShadow,
        borderRadius: 1,
        transition: `transform ${motion.durations.base}ms ${motion.crispOut}, box-shadow ${motion.durations.base}ms ${motion.crispOut}`,
        '&:hover': {
          transform: 'translate(-3px, -3px)',
          boxShadow: craftShadowDeep,
        },
        '&:active': {
          transform: 'translate(0, 0)',
          boxShadow: `3px 3px 0 ${seam}`,
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function CraftHeroWorkbench({ activeKey, onActive }: { activeKey: (typeof craftModules)[number]['key']; onActive: (key: (typeof craftModules)[number]['key']) => void }) {
  const active = craftModules.find((item) => item.key === activeKey) ?? craftModules[0];
  return (
    <CraftPanel sx={{ p: { xs: 1.5, sm: 2 }, minHeight: { xs: 520, md: 610 }, position: 'relative', overflow: 'hidden', bgcolor: '#FAEEDB' }}>
      <DashedRing sx={{ right: -28, top: -24, opacity: 0.75, animation: 'craftRingTurn 18s linear infinite' }} />
      <EightPointStar sx={{ position: 'absolute', left: 20, top: 22, transform: 'rotate(12deg)' }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2, position: 'relative', zIndex: 1 }}>
        {craftModules.map((item) => {
          const selected = item.key === activeKey;
          return (
            <Box
              key={item.key}
              component="button"
              type="button"
              onMouseEnter={() => onActive(item.key)}
              onFocus={() => onActive(item.key)}
              onClick={() => onActive(item.key)}
              sx={{
                p: 1.35,
                minHeight: 118,
                textAlign: 'left',
                cursor: 'pointer',
                border: `2px solid ${ink}`,
                borderRadius: 1,
                bgcolor: selected ? charcoal : '#FFF8EA',
                color: selected ? paper : ink,
                boxShadow: selected ? `5px 5px 0 ${amberDeep}` : `4px 4px 0 ${sand}`,
                transform: selected ? 'translate(-2px, -2px) rotate(-0.6deg)' : 'rotate(0deg)',
                transition: `transform ${motion.durations.base}ms ${motion.crispOut}, box-shadow ${motion.durations.base}ms ${motion.crispOut}, background-color ${motion.durations.fast}ms ease`,
                '&:hover, &:focus-visible': {
                  outline: 'none',
                  transform: 'translate(-3px, -3px) rotate(-0.8deg)',
                  boxShadow: `7px 7px 0 ${selected ? amberDeep : seam}`,
                },
                '&:active': {
                  transform: 'translate(0, 0)',
                  boxShadow: `2px 2px 0 ${seam}`,
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ display: 'grid', placeItems: 'center', width: 34, height: 34, border: `1.5px solid ${selected ? paper : ink}`, color: selected ? amber : amberDeep, bgcolor: selected ? ink : paper }}>
                  {item.icon}
                </Box>
                <Typography sx={{ fontFamily: monoStack, fontSize: 11, fontWeight: 850, letterSpacing: 0.7 }}>{item.emphasis}</Typography>
              </Box>
              <Typography sx={{ mt: 1.1, fontFamily: serifStack, fontWeight: 900, fontSize: 22, lineHeight: 1.02 }}>{item.label}</Typography>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          mt: { xs: 2, sm: 2.6 },
          p: { xs: 1.6, sm: 2 },
          border: `2px dashed ${ink}`,
          bgcolor: paper,
          minHeight: 188,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Typography sx={{ fontFamily: monoStack, fontWeight: 850, color: amberDeep, fontSize: 12, letterSpacing: 1 }}>LIVE MODULE</Typography>
        <Typography sx={{ mt: 0.8, fontFamily: serifStack, color: ink, fontSize: { xs: 34, sm: 42 }, fontWeight: 950, lineHeight: 0.96 }}>{active.title}</Typography>
        <WavyUnderline width={210} />
        <Typography sx={{ mt: 1.3, color: ink, lineHeight: 1.74, fontSize: 15.5 }}>{active.text}</Typography>
      </Box>
      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0.8, position: 'relative', zIndex: 1 }}>
        {agentSteps.map(([code, name], index) => (
          <Box
            key={code}
            sx={{
              minHeight: { xs: 72, sm: 84 },
              border: `1.5px solid ${ink}`,
              bgcolor: index % 2 ? '#F1DDC0' : '#FFF8EA',
              display: 'grid',
              alignContent: 'center',
              justifyItems: 'center',
              textAlign: 'center',
              transform: `rotate(${index % 2 ? 1.2 : -0.8}deg)`,
              animation: 'craftPressTick 4.2s ease-in-out infinite',
              animationDelay: `${index * 160}ms`,
            }}
          >
            <Typography sx={{ fontFamily: monoStack, fontSize: { xs: 10, sm: 11 }, fontWeight: 900, color: amberDeep }}>{code}</Typography>
            <Typography sx={{ mt: 0.25, fontWeight: 850, color: ink, fontSize: { xs: 12, sm: 14 } }}>{name}</Typography>
          </Box>
        ))}
      </Box>
    </CraftPanel>
  );
}

function CraftAgentSection() {
  return (
    <Box sx={{ py: { xs: 5, md: 7 } }}>
      <Box sx={{ bgcolor: charcoal, color: paper, border: `2px solid ${ink}`, boxShadow: `10px 10px 0 ${amberDeep}`, p: { xs: 2, sm: 3, md: 4 }, position: 'relative', overflow: 'hidden' }}>
        <EightPointStar sx={{ position: 'absolute', right: 24, top: 22, color: amber }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.8fr 1.2fr' }, gap: { xs: 3, md: 4 }, alignItems: 'start' }}>
          <Box>
            <TicketLabel dark>Agent is the feature</TicketLabel>
            <Typography component="h2" sx={{ mt: 2.4, fontFamily: serifStack, fontWeight: 950, fontSize: { xs: 42, md: 64 }, lineHeight: 0.95 }}>
              不是帮你说几句，<Box component="span" sx={{ color: amber }}>是把事情做成。</Box>
            </Typography>
            <Typography sx={{ mt: 2, color: '#EFE0C5', lineHeight: 1.78, fontSize: 17 }}>
              Agent 是 Sense Murmur 的生产力侧核心：它把聊天里的目标拆成计划，把计划写成产物，把产物放进可预览、可复制、可下载、可追溯版本的正式链路。
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.2 }}>
            {agentSteps.map(([code, title, text], index) => (
              <Box
                key={code}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '64px minmax(0, 1fr)', sm: '86px minmax(0, 1fr)' },
                  gap: 1.4,
                  alignItems: 'start',
                  p: 1.5,
                  border: `1.5px solid ${paper}`,
                  bgcolor: index === 2 ? amber : 'transparent',
                  color: index === 2 ? ink : paper,
                  boxShadow: index === 2 ? `5px 5px 0 ${paper}` : `5px 5px 0 ${amberDeep}`,
                  transition: `transform ${motion.durations.base}ms ${motion.crispOut}, box-shadow ${motion.durations.base}ms ${motion.crispOut}`,
                  '&:hover': {
                    transform: 'translate(-3px, -3px)',
                    boxShadow: `9px 9px 0 ${index === 2 ? paper : amber}`,
                  },
                  '&:active': {
                    transform: 'translate(0, 0)',
                    boxShadow: `2px 2px 0 ${index === 2 ? paper : amber}`,
                  },
                }}
              >
                <Typography sx={{ fontFamily: monoStack, fontWeight: 950, letterSpacing: 1, fontSize: 13 }}>{code}</Typography>
                <Box>
                  <Typography sx={{ fontFamily: serifStack, fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{title}</Typography>
                  <Typography sx={{ mt: 0.65, color: index === 2 ? ink : '#EFE0C5', lineHeight: 1.62, fontSize: 14.5 }}>{text}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function CraftFaqSection() {
  return (
    <Box sx={{ py: { xs: 5, md: 7 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.72fr 1.28fr' }, gap: { xs: 2.5, md: 4 }, alignItems: 'start' }}>
        <Box>
          <TicketLabel>Field notes</TicketLabel>
          <Typography component="h2" sx={{ mt: 2, fontFamily: serifStack, fontWeight: 950, color: ink, fontSize: { xs: 38, md: 56 }, lineHeight: 0.98 }}>
            先讲清楚，再谈气质。
          </Typography>
        </Box>
        <Box>
          {craftFaq.map(([question, answer]) => (
            <Box key={question} sx={{ py: 2.2, borderTop: `3px double ${ink}`, '&:last-child': { borderBottom: `3px double ${ink}` } }}>
              <Typography sx={{ fontFamily: serifStack, color: ink, fontWeight: 900, fontSize: { xs: 25, md: 31 }, lineHeight: 1.08 }}>{question}</Typography>
              <Typography sx={{ mt: 1, color: '#4C4034', lineHeight: 1.76, fontSize: 16 }}>{answer}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function CraftIntroPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<(typeof craftModules)[number]['key']>('agent');

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    rootRef.current?.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    rootRef.current?.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <Box
      ref={rootRef}
      onMouseMove={handleMouseMove}
      sx={{
        '--mx': '64%',
        '--my': '18%',
        width: '100%',
        minHeight: '100%',
        px: { xs: 1.5, sm: 2.5, lg: 4 },
        pt: { xs: 1.5, md: 3 },
        pb: { xs: 10, md: 8 },
        color: ink,
        bgcolor: paper,
        fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: [
          `radial-gradient(circle at var(--mx) var(--my), rgba(217,121,37,0.16), transparent 250px)`,
          'radial-gradient(circle at 12% 18%, rgba(199,165,106,0.22), transparent 210px)',
          'repeating-radial-gradient(circle at 20% 30%, rgba(33,27,22,0.045) 0 1px, transparent 1px 7px)',
        ].join(', '),
        ...reducedMotionDescendantSx,
        '@keyframes craftMarquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        '@keyframes craftRingTurn': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        '@keyframes craftPressTick': {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--r, 0deg))' },
          '50%': { transform: 'translateY(-3px) rotate(var(--r, 0deg))' },
        },
      }}
    >
      <Box sx={{ width: 'min(1180px, 100%)', mx: 'auto', position: 'relative' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.94fr 1.06fr' }, gap: { xs: 3.5, lg: 5 }, alignItems: 'end', minHeight: { lg: 'calc(100dvh - 150px)' }, pb: { xs: 5, md: 7 } }}>
          <Reveal>
            <Box sx={{ pt: { xs: 1, md: 4 }, position: 'relative' }}>
              <DashedRing sx={{ left: { xs: '68%', md: '54%' }, top: -12, opacity: 0.42 }} />
              <TicketLabel>Sense Murmur / role operating room</TicketLabel>
              <Typography
                component="h1"
                sx={{
                  mt: 2.2,
                  m: 0,
                  fontFamily: serifStack,
                  fontWeight: 950,
                  maxWidth: 780,
                  letterSpacing: 0,
                  lineHeight: { xs: 0.95, md: 0.88 },
                  fontSize: { xs: 54, sm: 78, md: 104 },
                  color: ink,
                }}
              >
                AI 角色世界的运行工坊
              </Typography>
              <WavyUnderline width={300} />
              <Typography sx={{ mt: 2, maxWidth: 680, color: '#4C4034', lineHeight: 1.82, fontSize: { xs: 16, md: 18 } }}>
                创建角色，放进房间，让关系、记忆、私密线程和 Agent 产物形成一条长期主链。朋友圈和日历只是世界露出的边角，真正的核心是角色会理解你，并把事情继续推进。
              </Typography>
              <Box sx={{ mt: 3.2, display: 'flex', flexWrap: 'wrap', gap: 1.2 }}>
                <Button
                  variant="contained"
                  startIcon={<ExtensionIcon />}
                  onClick={() => navigate('/chats/create')}
                  sx={{ borderRadius: 0.8, bgcolor: amber, color: ink, border: `2px solid ${ink}`, boxShadow: `5px 5px 0 ${ink}`, fontWeight: 900, px: 2.2, py: 1.1, '&:hover': { bgcolor: '#F1A04A', boxShadow: `8px 8px 0 ${ink}`, transform: 'translate(-2px, -2px)' }, '&:active': { boxShadow: `2px 2px 0 ${ink}`, transform: 'translate(0, 0)' } }}
                >
                  开始使用 Agent
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<PersonAddAlt1Icon />}
                  onClick={() => navigate('/characters/create')}
                  sx={{ borderRadius: 0.8, color: ink, border: `2px solid ${ink}`, boxShadow: `5px 5px 0 ${sand}`, fontWeight: 900, px: 2.2, py: 1.1, '&:hover': { border: `2px solid ${ink}`, bgcolor: '#FFF8EA', boxShadow: `8px 8px 0 ${sand}`, transform: 'translate(-2px, -2px)' }, '&:active': { boxShadow: `2px 2px 0 ${sand}`, transform: 'translate(0, 0)' } }}
                >
                  创建角色
                </Button>
              </Box>
            </Box>
          </Reveal>
          <Reveal delay={120}>
            <CraftHeroWorkbench activeKey={activeKey} onActive={setActiveKey} />
          </Reveal>
        </Box>

        <Box sx={{ mx: { xs: -1.5, sm: -2.5, lg: -4 }, overflow: 'hidden', borderTop: `2px solid ${ink}`, borderBottom: `2px solid ${ink}`, bgcolor: charcoal, color: paper }}>
          <Box sx={{ display: 'flex', width: 'max-content', animation: 'craftMarquee 22s linear infinite', py: { xs: 1.2, md: 1.6 } }}>
            {Array.from({ length: 2 }).map((_, group) => (
              <Box key={group} sx={{ display: 'flex', alignItems: 'center' }}>
                {['Agent plans', 'Memory remembers', 'Rooms evolve', 'Relationships push back', 'Artifacts stay'].map((item) => (
                  <Typography key={`${group}-${item}`} sx={{ mx: { xs: 2, md: 4 }, fontFamily: serifStack, fontSize: { xs: 34, md: 52 }, fontWeight: 950, whiteSpace: 'nowrap' }}>
                    {item}<Box component="span" sx={{ color: amber }}> *</Box>
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' }, gap: { xs: 2, md: 3 }, alignItems: 'stretch' }}>
          <Reveal>
            <CraftPanel sx={{ p: { xs: 2, md: 3 }, minHeight: 330, bgcolor: '#FFF8EA' }}>
              <TicketLabel>What it is</TicketLabel>
              <Typography component="h2" sx={{ mt: 2, fontFamily: serifStack, fontWeight: 950, color: ink, fontSize: { xs: 40, md: 64 }, lineHeight: 0.96 }}>
                不是聊天皮肤，是角色连续性的底座。
              </Typography>
              <Typography sx={{ mt: 1.8, color: '#4C4034', fontSize: 17, lineHeight: 1.82 }}>
                房间、私聊、AI 私密线程、记忆、关系、Agent 产物和世界事件都不是孤立模块。它们共同塑造一个角色在你这里的独有实例。
              </Typography>
            </CraftPanel>
          </Reveal>
          <Box sx={{ display: 'grid', gap: 1.2 }}>
            {craftFacts.map(([title, text], index) => (
              <Reveal key={title} delay={index * 60}>
                <CraftPanel sx={{ p: 1.6, bgcolor: index % 2 ? '#F1DDC0' : '#FFF8EA', boxShadow: `5px 5px 0 ${seam}` }}>
                  <Typography sx={{ fontFamily: monoStack, color: amberDeep, fontWeight: 950, fontSize: 12 }}>{String(index + 1).padStart(2, '0')}</Typography>
                  <Typography sx={{ mt: 0.5, fontFamily: serifStack, color: ink, fontWeight: 900, fontSize: 27, lineHeight: 1 }}>{title}</Typography>
                  <Typography sx={{ mt: 0.7, color: '#4C4034', fontSize: 14.5, lineHeight: 1.64 }}>{text}</Typography>
                </CraftPanel>
              </Reveal>
            ))}
          </Box>
        </Box>

        <CraftAgentSection />

        <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.78fr 1.22fr' }, gap: { xs: 2.5, md: 4 }, alignItems: 'center' }}>
          <Reveal>
            <Box>
              <TicketLabel>World edge</TicketLabel>
              <Typography component="h2" sx={{ mt: 2, fontFamily: serifStack, fontWeight: 950, color: ink, fontSize: { xs: 38, md: 58 }, lineHeight: 0.98 }}>
                朋友圈和日历，只是世界露出的票根。
              </Typography>
              <Typography sx={{ mt: 1.6, color: '#4C4034', lineHeight: 1.78, fontSize: 16.5 }}>
                它们负责让关系余波、活动约定和角色状态有地方出现，但不抢主叙事。用户真正需要记住的是：角色不是只在对话框中存活。
              </Typography>
            </Box>
          </Reveal>
          <Reveal delay={100}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.4 }}>
              {[
                ['朋友圈', '公开动态只使用可公开的余味，不泄露私域记忆。'],
                ['活动日历', '约定、提醒和冲突修正进入世界时间表。'],
              ].map(([title, text], index) => (
                <CraftPanel key={title} sx={{ p: 2, minHeight: 210, bgcolor: index ? '#F1DDC0' : '#FFF8EA', transform: index ? 'rotate(1.2deg)' : 'rotate(-1deg)' }}>
                  <DynamicFeedIcon sx={{ display: title === '朋友圈' ? 'block' : 'none', color: amberDeep, fontSize: 32 }} />
                  <CalendarMonthIcon sx={{ display: title === '活动日历' ? 'block' : 'none', color: amberDeep, fontSize: 32 }} />
                  <Typography sx={{ mt: 1.2, fontFamily: serifStack, fontWeight: 930, fontSize: 34, color: ink, lineHeight: 0.96 }}>{title}</Typography>
                  <Typography sx={{ mt: 1.1, color: '#4C4034', lineHeight: 1.7 }}>{text}</Typography>
                </CraftPanel>
              ))}
            </Box>
          </Reveal>
        </Box>

        <CraftFaqSection />

        <Reveal>
          <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center', borderTop: `2px solid ${ink}` }}>
            <Box>
              <Typography sx={{ fontFamily: serifStack, color: ink, fontWeight: 950, fontSize: { xs: 38, md: 58 }, lineHeight: 0.98 }}>想看原来的概念篇？</Typography>
              <Typography sx={{ mt: 1.2, color: '#4C4034', lineHeight: 1.72 }}>产品介绍页负责讲清能力；概念篇保留“角色为什么需要来处”的叙事。</Typography>
            </Box>
            <Button
              variant="outlined"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate('/intro/concept')}
              sx={{ justifySelf: { xs: 'start', md: 'end' }, borderRadius: 0.8, color: ink, border: `2px solid ${ink}`, boxShadow: `5px 5px 0 ${sand}`, fontWeight: 900, px: 2.2, py: 1.1, '&:hover': { border: `2px solid ${ink}`, bgcolor: '#FFF8EA', boxShadow: `8px 8px 0 ${sand}`, transform: 'translate(-2px, -2px)' }, '&:active': { boxShadow: `2px 2px 0 ${sand}`, transform: 'translate(0, 0)' } }}
            >
              阅读概念篇
            </Button>
          </Box>
        </Reveal>
      </Box>
    </Box>
  );
}

const premiumBg = '#151413';
const premiumPanel = '#201D1A';
const premiumPanelSoft = '#29241F';
const premiumInk = '#F4E9D8';
const premiumMuted = '#C8B8A1';
const premiumAmber = '#D9862C';
const premiumAmberSoft = '#F0B15C';
const premiumLine = 'rgba(244, 233, 216, 0.14)';
const premiumSerif = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';

const premiumFeatures = [
  {
    key: 'group',
    label: '多角色群聊',
    title: '不是一问一答，是一群人在场',
    text: '你可以把不同性格的角色放进同一间房。他们会围绕话题自然接话，也会因为设定和关系产生不同反应。有人补充，有人反驳，有人把气氛拉回来。',
    icon: <ForumOutlinedIcon />,
  },
  {
    key: 'profile',
    label: '角色多维设定',
    title: '角色不是一句人设',
    text: '外观、性格、说话风格、擅长领域、关系备注和模型参数，都会影响角色的表现。你不是在保存一个 prompt，而是在搭建一个可以反复使用的角色。',
    icon: <PsychologyIcon />,
  },
  {
    key: 'memory',
    label: '长期记忆和关系',
    title: '聊过的事，不会轻易归零',
    text: '重要经历、用户信息、关系印象和约定会被保留下来。下一次对话时，角色可以带着这些背景回应你，而不是像第一次见面。',
    icon: <MemoryIcon />,
  },
  {
    key: 'companion',
    label: '亲密陪伴',
    title: '亲密感，藏在细节里',
    text: '专属称呼、共同话语、日常问候、纪念日和主动关心，会让角色更像长期陪在你身边的人。频率和边界也可以控制，靠近不等于打扰。',
    icon: <HubIcon />,
  },
  {
    key: 'agent',
    label: 'Agent 工作流',
    title: '需要做事时，再交给 Agent',
    text: '当你想整理内容、写文档、生成代码或制作图表时，助手 Agent 可以把聊天里的需求推进成可保存、可修改的产物。',
    icon: <ExtensionIcon />,
  },
  {
    key: 'proxy',
    label: 'AI 中转站',
    title: '模型能力，也可以统一管理',
    text: '中转站用于配置模型供应商、Key、额度和 API 转发。不同模型可以进入同一套使用体验。',
    icon: <KeyIcon />,
  },
] as const;

const premiumAgentSteps = [
  ['识别目标', '判断是问答、创作、修改、整理还是需要澄清。'],
  ['制定计划', '拆解任务范围，确认目标格式和产物类型。'],
  ['生成产物', '输出文档、代码、图表、HTML、JSON、CSV 等内容。'],
  ['校验版本', '检查结构和版本，再进入产物管理。'],
];

function PremiumTag({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ px: 1.2, py: 0.55, border: `1px solid ${premiumLine}`, borderRadius: 1.2, color: premiumMuted, fontFamily: monoStack, fontSize: 12, letterSpacing: 0.6 }}>
      {children}
    </Box>
  );
}

function PremiumCard({ children, active = false, sx = {} }: { children: ReactNode; active?: boolean; sx?: object }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: active ? 'rgba(217, 134, 44, 0.58)' : premiumLine,
        bgcolor: active ? 'rgba(217, 134, 44, 0.10)' : premiumPanel,
        borderRadius: 2,
        boxShadow: active ? '0 18px 44px rgba(0,0,0,0.24)' : '0 12px 34px rgba(0,0,0,0.18)',
        transition: `transform ${motion.durations.base}ms ${motion.crispOut}, border-color ${motion.durations.base}ms ${motion.crispOut}, background-color ${motion.durations.fast}ms ease, box-shadow ${motion.durations.base}ms ${motion.crispOut}`,
        '&:hover': {
          transform: 'translateY(-5px)',
          borderColor: 'rgba(217, 134, 44, 0.62)',
          boxShadow: '0 22px 54px rgba(0,0,0,0.28)',
        },
        '&:active': {
          transform: 'translateY(-1px)',
          boxShadow: '0 10px 26px rgba(0,0,0,0.20)',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function PremiumConsole({ activeKey, onActive }: { activeKey: (typeof premiumFeatures)[number]['key']; onActive: (key: (typeof premiumFeatures)[number]['key']) => void }) {
  const active = premiumFeatures.find((item) => item.key === activeKey) ?? premiumFeatures[0];
  return (
    <PremiumCard active sx={{ p: { xs: 1.4, sm: 1.8 }, minHeight: { xs: 500, md: 610 }, overflow: 'hidden', position: 'relative', bgcolor: premiumPanelSoft }}>
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(244,233,216,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(244,233,216,0.035) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          opacity: 0.55,
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.8 }}>
          <PremiumTag>LIVE PRODUCT MAP</PremiumTag>
          <Box sx={{ display: 'flex', gap: 0.6 }}>
            {[0, 1, 2].map((item) => <Box key={item} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item === 1 ? premiumAmber : premiumLine }} />)}
          </Box>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
          {premiumFeatures.map((item) => {
            const selected = item.key === activeKey;
            return (
              <Box
                key={item.key}
                component="button"
                type="button"
                onMouseEnter={() => onActive(item.key)}
                onFocus={() => onActive(item.key)}
                onClick={() => onActive(item.key)}
                sx={{
                  minHeight: 92,
                  p: 1.25,
                  textAlign: 'left',
                  border: '1px solid',
                  borderColor: selected ? 'rgba(217,134,44,0.72)' : premiumLine,
                  borderRadius: 1.4,
                  bgcolor: selected ? 'rgba(217,134,44,0.14)' : 'rgba(21,20,19,0.58)',
                  color: premiumInk,
                  cursor: 'pointer',
                  transition: `transform ${motion.durations.base}ms ${motion.crispOut}, border-color ${motion.durations.base}ms ${motion.crispOut}, background-color ${motion.durations.fast}ms ease`,
                  '&:hover, &:focus-visible': {
                    outline: 'none',
                    transform: 'translateY(-4px)',
                    borderColor: 'rgba(217,134,44,0.80)',
                  },
                  '&:active': { transform: 'translateY(-1px)' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ color: selected ? premiumAmberSoft : premiumMuted, display: 'grid', '& svg': { fontSize: 21 } }}>{item.icon}</Box>
                  <Typography sx={{ fontWeight: 820, fontSize: 15 }}>{item.label}</Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ mt: 2, p: { xs: 1.6, sm: 2 }, borderRadius: 2, border: `1px solid ${premiumLine}`, bgcolor: 'rgba(21,20,19,0.78)' }}>
          <Typography sx={{ color: premiumAmberSoft, fontFamily: monoStack, fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>CURRENT FOCUS</Typography>
          <Typography sx={{ mt: 0.8, color: premiumInk, fontFamily: premiumSerif, fontSize: { xs: 32, sm: 42 }, fontWeight: 880, lineHeight: 1.02 }}>{active.title}</Typography>
          <Typography sx={{ mt: 1.25, color: premiumMuted, lineHeight: 1.74, fontSize: 15.5 }}>{active.text}</Typography>
        </Box>
      </Box>
    </PremiumCard>
  );
}

function PremiumIntroPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<(typeof premiumFeatures)[number]['key']>('group');

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    rootRef.current?.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    rootRef.current?.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <Box
      ref={rootRef}
      onMouseMove={handleMouseMove}
      sx={{
        '--mx': '62%',
        '--my': '22%',
        width: '100%',
        minHeight: '100%',
        px: { xs: 2, sm: 2.5, lg: 4 },
        pt: { xs: 1.5, md: 3 },
        pb: { xs: 10, md: 8 },
        color: premiumInk,
        bgcolor: premiumBg,
        fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: [
          'radial-gradient(circle at var(--mx) var(--my), rgba(217,134,44,0.18), transparent 310px)',
          'linear-gradient(135deg, rgba(244,233,216,0.055), transparent 34%, rgba(217,134,44,0.055))',
        ].join(', '),
        ...reducedMotionDescendantSx,
        '@keyframes premiumMarquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      }}
    >
      <Box sx={{ width: 'min(1180px, 100%)', mx: 'auto' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.92fr 1.08fr' }, gap: { xs: 3.5, lg: 5 }, alignItems: 'center', minHeight: { lg: 'calc(100dvh - 150px)' }, pb: { xs: 5, md: 7 } }}>
          <Reveal>
            <Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mb: 3 }}>
                {['多角色群聊', '角色多维设定', '长期记忆和关系', '亲密陪伴', 'Agent 工作流', 'AI 中转站'].map((item) => (
                  <PremiumTag key={item}>{item}</PremiumTag>
                ))}
              </Box>
              <Typography component="h1" sx={{ m: 0, maxWidth: 760, color: premiumInk, fontFamily: premiumSerif, fontWeight: 900, letterSpacing: 0, lineHeight: { xs: 1.02, md: 0.96 }, fontSize: { xs: 46, sm: 66, md: 86 } }}>
                一间房里，不止一个声音。
              </Typography>
              <Typography sx={{ mt: 2.2, maxWidth: 690, color: premiumMuted, lineHeight: 1.82, fontSize: { xs: 16, md: 18 } }}>
                你可以创建多个 AI 角色，让他们在同一间房里接话、插话、争论、玩笑。随着互动变多，角色会记住重要经历、形成关系印象，也逐渐拥有只属于你的陪伴细节。
              </Typography>
              <Box sx={{ mt: 3.4, display: 'flex', flexWrap: 'wrap', gap: 1.2 }}>
                <Button variant="contained" startIcon={<ForumOutlinedIcon />} onClick={() => navigate('/chats/create')} sx={{ borderRadius: 2, bgcolor: premiumAmber, color: '#171310', fontWeight: 850, px: 2.2, py: 1.1, boxShadow: '0 16px 34px rgba(217,134,44,0.22)', '&:hover': { bgcolor: premiumAmberSoft, transform: 'translateY(-3px)', boxShadow: '0 22px 42px rgba(217,134,44,0.28)' }, '&:active': { transform: 'translateY(-1px)' } }}>
                  开始群聊
                </Button>
                <Button variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => navigate('/characters/create')} sx={{ borderRadius: 2, color: premiumInk, borderColor: 'rgba(244,233,216,0.28)', fontWeight: 850, px: 2.2, py: 1.1, '&:hover': { borderColor: premiumAmber, bgcolor: 'rgba(217,134,44,0.10)', transform: 'translateY(-3px)' }, '&:active': { transform: 'translateY(-1px)' } }}>
                  创建角色
                </Button>
              </Box>
            </Box>
          </Reveal>
          <Reveal delay={120}>
            <PremiumConsole activeKey={activeKey} onActive={setActiveKey} />
          </Reveal>
        </Box>

        <Box sx={{ mx: { xs: -2, sm: -2.5, lg: -4 }, overflow: 'hidden', borderTop: `1px solid ${premiumLine}`, borderBottom: `1px solid ${premiumLine}`, bgcolor: '#11100F' }}>
          <Box sx={{ display: 'flex', width: 'max-content', py: { xs: 1.4, md: 1.7 }, animation: 'premiumMarquee 24s linear infinite' }}>
            {Array.from({ length: 2 }).map((_, group) => (
              <Box key={group} sx={{ display: 'flex', alignItems: 'center' }}>
                {['Group chat', 'Character settings', 'Long-term memory', 'Relationship data', 'Companionship', 'Agent workflow', 'AI proxy'].map((item) => (
                  <Typography key={`${group}-${item}`} sx={{ mx: { xs: 2, md: 4 }, color: item === 'Agent workflow' ? premiumAmberSoft : premiumInk, fontFamily: premiumSerif, fontWeight: 850, fontSize: { xs: 30, md: 44 }, whiteSpace: 'nowrap' }}>
                    {item}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 } }}>
          <Reveal>
            <Typography sx={{ color: premiumAmberSoft, fontFamily: monoStack, fontWeight: 850, fontSize: 12, letterSpacing: 1.1 }}>CORE EXPERIENCE</Typography>
            <Typography component="h2" sx={{ mt: 1.2, color: premiumInk, fontFamily: premiumSerif, fontWeight: 900, fontSize: { xs: 36, md: 58 }, lineHeight: 1.02 }}>
              不只是更会回答，而是更像有人在场。
            </Typography>
          </Reveal>
          <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.4 }}>
            {premiumFeatures.map((item, index) => (
              <Reveal key={item.key} delay={index * 45}>
                <PremiumCard active={item.key === 'group'} sx={{ p: 2, minHeight: 250 }}>
                  <Box sx={{ color: item.key === 'agent' ? premiumAmberSoft : premiumMuted, '& svg': { fontSize: 30 } }}>{item.icon}</Box>
                  <Typography sx={{ mt: 1.4, color: premiumInk, fontFamily: premiumSerif, fontWeight: 880, fontSize: 30, lineHeight: 1.05 }}>{item.label}</Typography>
                  <Typography sx={{ mt: 1.1, color: premiumMuted, lineHeight: 1.72, fontSize: 14.8 }}>{item.text}</Typography>
                </PremiumCard>
              </Reveal>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.78fr 1.22fr' }, gap: { xs: 2.5, md: 4 }, alignItems: 'start' }}>
          <Reveal>
            <Box>
              <PremiumTag>AGENT WORKFLOW</PremiumTag>
              <Typography component="h2" sx={{ mt: 2, color: premiumInk, fontFamily: premiumSerif, fontWeight: 900, fontSize: { xs: 40, md: 66 }, lineHeight: 0.98 }}>
                Agent 是把想法落地的那条线。
              </Typography>
              <Typography sx={{ mt: 1.6, color: premiumMuted, lineHeight: 1.78, fontSize: 16.5 }}>
                当你不只是想聊天，而是想整理内容、写文档、改代码、做表格或生成网页，助手 Agent 会把目标推进到可保存、可修改的结果。
              </Typography>
            </Box>
          </Reveal>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {premiumAgentSteps.map(([title, text], index) => (
              <Reveal key={title} delay={index * 60}>
                <PremiumCard active={index === 2} sx={{ p: 1.8, display: 'grid', gridTemplateColumns: { xs: '42px minmax(0, 1fr)', sm: '64px minmax(0, 1fr)' }, gap: 1.5, alignItems: 'start' }}>
                  <Typography sx={{ color: premiumAmberSoft, fontFamily: monoStack, fontWeight: 900, fontSize: 13 }}>{String(index + 1).padStart(2, '0')}</Typography>
                  <Box>
                    <Typography sx={{ color: premiumInk, fontFamily: premiumSerif, fontWeight: 880, fontSize: 28, lineHeight: 1 }}>{title}</Typography>
                    <Typography sx={{ mt: 0.7, color: premiumMuted, lineHeight: 1.62 }}>{text}</Typography>
                  </Box>
                </PremiumCard>
              </Reveal>
            ))}
          </Box>
        </Box>

        <Reveal>
          <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center', borderTop: `1px solid ${premiumLine}` }}>
            <Box>
              <Typography sx={{ color: premiumInk, fontFamily: premiumSerif, fontWeight: 900, fontSize: { xs: 34, md: 52 }, lineHeight: 1.02 }}>从一个角色和一个群聊开始。</Typography>
              <Typography sx={{ mt: 1.1, color: premiumMuted, lineHeight: 1.72 }}>先创建角色，再把他们放进房间。模型接入和 Agent 能力可以在后续按需配置。</Typography>
            </Box>
            <Button variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/characters/create')} sx={{ justifySelf: { xs: 'start', md: 'end' }, borderRadius: 2, color: premiumInk, borderColor: 'rgba(244,233,216,0.28)', fontWeight: 850, px: 2.2, py: 1.1, '&:hover': { borderColor: premiumAmber, bgcolor: 'rgba(217,134,44,0.10)', transform: 'translateY(-3px)' }, '&:active': { transform: 'translateY(-1px)' } }}>
              创建角色
            </Button>
          </Box>
        </Reveal>
      </Box>
    </Box>
  );
}

const editorialBg = 'var(--intro-bg)';
const editorialInk = 'var(--intro-ink)';
const editorialMuted = 'var(--intro-muted)';
const editorialAmber = 'var(--intro-amber)';
const editorialAmberDeep = 'var(--intro-amber-deep)';
const editorialSurface = 'var(--intro-surface)';
const editorialClay = '#D9B78D';
const editorialCharcoal = 'var(--intro-charcoal)';
const editorialLine = 'var(--intro-line)';
const editorialSerif = '"Noto Serif SC", "Source Han Serif SC", Georgia, serif';

const editorialFeatures = [
  {
    key: 'group',
    label: '多角色群聊',
    title: '不是一问一答，是一群人在场。',
    text: '把不同性格的角色放进同一间房。他们会围绕话题接话、插话、争论、玩笑，也会因为设定和关系给出不同反应。',
    icon: <ForumOutlinedIcon />,
  },
  {
    key: 'profile',
    label: '角色多维设定',
    title: '角色不是一句人设。',
    text: '外观、性格、说话风格、擅长领域、关系备注和模型参数，都会影响角色的表现。',
    icon: <PsychologyIcon />,
  },
  {
    key: 'memory',
    label: '长期记忆和关系',
    title: '聊过的事，不会轻易归零。',
    text: '重要经历、用户信息、关系印象和约定会被保留下来。下一次对话，角色可以带着背景回应你。',
    icon: <MemoryIcon />,
  },
  {
    key: 'companion',
    label: '亲密陪伴',
    title: '亲密感，藏在细节里。',
    text: '专属称呼、共同话语、日常问候、纪念日和主动关心，让角色更像长期陪在身边的人。',
    icon: <HubIcon />,
  },
] as const;

const editorialUtilities = [
  ['Agent 工作流', '需要整理内容、写文档、生成代码或制作图表时，Agent 可以把聊天里的需求推进成可保存、可修改的产物。', <ExtensionIcon />],
  ['AI 中转站', '统一配置模型供应商、Key、额度和 API 转发，把不同模型接入同一套使用体验。', <KeyIcon />],
  ['朋友圈与日历', '动态、活动和约定作为轻量补充，让角色互动留下可查看的日常痕迹。', <CalendarMonthIcon />],
] as const;

const editorialMessages = [
  { name: '阿晚', tone: '温柔但敏感', text: '我记得你上次说过，不喜欢把事情拖到很晚。今天要不要早点收一下？', x: 5, y: 22, color: '#E8A35C' },
  { name: '老李', tone: '稳重吐槽役', text: '先别急着下结论。让她把话说完，我们再拆。', x: 42, y: 8, color: '#C96F25' },
  { name: '涩涩', tone: '嘴硬但护短', text: '我不是在帮他说话，我只是觉得你们这次都太快开火了。', x: 30, y: 56, color: '#9F6A3D' },
];

function EditorialPill({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <Box
      sx={{
        px: 1.25,
        py: 0.65,
        borderRadius: 999,
        border: '1px solid',
        borderColor: active ? 'rgba(201,111,37,0.42)' : editorialLine,
        bgcolor: active ? 'rgba(201,111,37,0.10)' : 'rgba(255,249,240,0.72)',
        color: active ? editorialAmberDeep : editorialMuted,
        fontFamily: monoStack,
        fontSize: 12,
        fontWeight: 760,
        letterSpacing: 0.4,
      }}
    >
      {children}
    </Box>
  );
}

function EditorialSurface({ children, sx = {}, ...props }: { children: ReactNode; sx?: object } & Omit<ComponentProps<typeof Box>, 'children' | 'sx'>) {
  return (
    <Box
      {...props}
      sx={{
        border: `1px solid ${editorialLine}`,
        bgcolor: 'rgba(255,249,240,0.88)',
        borderRadius: { xs: 3, md: 4 },
        boxShadow: '0 24px 70px rgba(67, 47, 31, 0.13)',
        transition: `transform ${motion.durations.base}ms ${motion.crispOut}, box-shadow ${motion.durations.base}ms ${motion.crispOut}, border-color ${motion.durations.base}ms ease`,
        '&:hover': {
          transform: 'translateY(-5px)',
          borderColor: 'rgba(201,111,37,0.30)',
          boxShadow: '0 30px 90px rgba(67, 47, 31, 0.18)',
        },
        '&:active': {
          transform: 'translateY(-1px)',
          boxShadow: '0 18px 48px rgba(67, 47, 31, 0.14)',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function EditorialRoomStage({
  activeKey,
  onActive,
  onInteractionChange,
}: {
  activeKey: (typeof editorialFeatures)[number]['key'];
  onActive: (key: (typeof editorialFeatures)[number]['key']) => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const active = editorialFeatures.find((item) => item.key === activeKey) ?? editorialFeatures[0];
  const activeIndex = editorialFeatures.findIndex((item) => item.key === activeKey);

  return (
    <EditorialSurface
      onMouseEnter={() => onInteractionChange?.(true)}
      onMouseLeave={() => onInteractionChange?.(false)}
      sx={{
        minHeight: { xs: 540, md: 640 },
        p: { xs: 1.4, sm: 2 },
        position: 'relative',
        overflow: 'hidden',
        bgcolor: '#FBF1E4',
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: [
            'radial-gradient(circle at 32% 26%, rgba(201,111,37,0.20), transparent 180px)',
            'radial-gradient(circle at 78% 72%, rgba(217,183,141,0.32), transparent 220px)',
          ].join(', '),
        }}
      />
      <Box sx={{ position: 'relative', zIndex: 1, height: '100%', minHeight: { xs: 510, md: 610 }, display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 1.4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
          <EditorialPill active>群聊预览</EditorialPill>
          <Box sx={{ display: 'flex', gap: 0.65 }}>
            {editorialFeatures.map((item) => (
              <Box
                key={item.key}
                component="button"
                type="button"
                aria-label={item.label}
                onMouseEnter={() => onActive(item.key)}
                onFocus={() => onActive(item.key)}
                onClick={() => onActive(item.key)}
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  bgcolor: activeKey === item.key ? editorialAmber : 'rgba(33,26,22,0.18)',
                  transform: activeKey === item.key ? 'scale(1.28)' : 'scale(1)',
                  transition: 'transform 180ms ease, background-color 180ms ease',
                }}
              />
            ))}
          </Box>
        </Box>

        <Box sx={{ position: 'relative', minHeight: 360 }}>
          <Box
            sx={{
              position: 'absolute',
              left: { xs: '8%', sm: '12%' },
              top: { xs: 96, sm: 110 },
              width: { xs: 190, sm: 230 },
              height: { xs: 190, sm: 230 },
              borderRadius: '50%',
              border: '1px solid rgba(33,26,22,0.12)',
              animation: 'editorialBreath 5.6s ease-in-out infinite',
            }}
          />
          {editorialMessages.map((item, index) => (
            <Box
              key={item.name}
              sx={{
                position: 'absolute',
                left: { xs: `${Math.max(0, item.x - 4)}%`, sm: `${item.x}%` },
                top: `${item.y}%`,
                width: { xs: 230, sm: 270 },
                p: 1.45,
                borderRadius: 3,
                bgcolor: 'rgba(255,249,240,0.92)',
                border: `1px solid rgba(33,26,22,0.12)`,
                boxShadow: '0 18px 54px rgba(67,47,31,0.13)',
                animation: `editorialCardIn 720ms ${motion.crispOut} both, editorialFloat 5.8s ease-in-out infinite`,
                animationDelay: `${index * 460}ms`,
                transform: `rotate(${index === 1 ? 1.2 : index === 2 ? -1.4 : -0.8}deg)`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: item.color, display: 'grid', placeItems: 'center', color: '#FFF9F0', fontFamily: premiumSerif, fontWeight: 900 }}>{item.name.slice(0, 1)}</Box>
                <Box>
                  <Typography sx={{ color: editorialInk, fontWeight: 850, fontSize: 14 }}>{item.name}</Typography>
                  <Typography sx={{ color: editorialMuted, fontSize: 11.5 }}>{item.tone}</Typography>
                </Box>
              </Box>
              <Typography sx={{ mt: 1, color: '#463A31', lineHeight: 1.58, fontSize: 13.5 }}>{item.text}</Typography>
            </Box>
          ))}
        </Box>

        <Box sx={{ position: 'relative', minHeight: { xs: 178, sm: 156 }, overflow: 'hidden', borderRadius: 3, bgcolor: 'rgba(39,34,31,0.96)', color: '#FFF4E4' }}>
          {editorialFeatures.map((item, index) => {
            const offset = index - activeIndex;
            const selected = item.key === active.key;
            return (
              <Box
                key={item.key}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  p: 1.6,
                  opacity: selected ? 1 : 0,
                  transform: `translateX(${offset * 38}px) scale(${selected ? 1 : 0.98})`,
                  pointerEvents: selected ? 'auto' : 'none',
                  transition: `opacity 360ms ${motion.softOut}, transform 420ms ${motion.crispOut}`,
                }}
              >
                <Typography sx={{ color: editorialAmber, fontFamily: monoStack, fontSize: 12, fontWeight: 850, letterSpacing: 0.7 }}>{item.label}</Typography>
                <Typography sx={{ mt: 0.7, fontFamily: editorialSerif, fontWeight: 900, fontSize: { xs: 25, sm: 31 }, lineHeight: 1.05 }}>{item.title}</Typography>
                <Typography sx={{ mt: 0.8, color: '#D8C6AE', lineHeight: 1.65, fontSize: 14 }}>{item.text}</Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </EditorialSurface>
  );
}

function EditorialIntroPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { setHideMobileBottomNav } = useLayoutHeaderActions();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeKey, setActiveKey] = useState<(typeof editorialFeatures)[number]['key']>('group');
  const [previewPaused, setPreviewPaused] = useState(false);

  useEffect(() => {
    setHideMobileBottomNav(true);
    return () => setHideMobileBottomNav(false);
  }, [setHideMobileBottomNav]);

  useEffect(() => {
    if (previewPaused) return undefined;
    const timer = window.setInterval(() => {
      setActiveKey((current) => {
        const index = editorialFeatures.findIndex((item) => item.key === current);
        return editorialFeatures[(index + 1) % editorialFeatures.length].key;
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, [previewPaused]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    rootRef.current?.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    rootRef.current?.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <Box
      ref={rootRef}
      onMouseMove={handleMouseMove}
      sx={{
        '--mx': '70%',
        '--my': '18%',
        '--intro-bg': theme.palette.background.default,
        '--intro-ink': theme.palette.text.primary,
        '--intro-muted': theme.palette.text.secondary,
        '--intro-amber': theme.palette.primary.main,
        '--intro-amber-deep': theme.palette.primary.dark,
        '--intro-surface': theme.palette.background.paper,
        '--intro-charcoal': theme.palette.mode === 'dark' ? theme.palette.surface.main : '#27221F',
        '--intro-line': theme.palette.divider,
        width: '100%',
        minHeight: '100%',
        px: { xs: 2, sm: 2.5, lg: 4 },
        pt: { xs: 1.5, md: 3 },
        pb: { xs: 10, md: 8 },
        color: editorialInk,
        bgcolor: editorialBg,
        fontFamily: 'Inter, "Noto Sans SC", system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: [
          'radial-gradient(circle at var(--mx) var(--my), rgba(201,111,37,0.18), transparent 320px)',
          'linear-gradient(135deg, rgba(255,249,240,0.92), rgba(239,220,194,0.74))',
        ].join(', '),
        ...reducedMotionDescendantSx,
        '@keyframes editorialFloat': {
          '0%, 100%': { translate: '0 0' },
          '50%': { translate: '0 -8px' },
        },
        '@keyframes editorialCardIn': {
          '0%': { opacity: 0, scale: 0.96, filter: 'saturate(0.86)' },
          '100%': { opacity: 1, scale: 1, filter: 'saturate(1)' },
        },
        '@keyframes editorialRise': {
          '0%': { opacity: 0, transform: 'translateY(18px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes editorialCursor': {
          '0%, 100%': { transform: 'translate(-50%, -50%) scale(1)' },
          '50%': { transform: 'translate(-50%, -50%) scale(1.18)' },
        },
        '@keyframes editorialBreath': {
          '0%, 100%': { transform: 'scale(1)', opacity: 0.48 },
          '50%': { transform: 'scale(1.08)', opacity: 0.78 },
        },
        '@keyframes editorialMarquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 'var(--mx)',
          top: 'var(--my)',
          width: 112,
          height: 112,
          borderRadius: '50%',
          border: '1px solid rgba(201,111,37,0.22)',
          pointerEvents: 'none',
          opacity: 0.56,
          animation: 'editorialCursor 3.2s ease-in-out infinite',
          zIndex: 0,
        },
      }}
    >
      <Box sx={{ width: 'min(1180px, 100%)', mx: 'auto', position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.1fr' }, gap: { xs: 3.5, lg: 5.5 }, alignItems: 'center', minHeight: { lg: 'calc(100dvh - 150px)' }, pb: { xs: 5, md: 7 } }}>
          <Reveal>
            <Box sx={{ pt: { xs: 1, md: 2 } }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3, animation: `editorialRise 680ms ${motion.crispOut} both` }}>
                {['多角色群聊', '角色设定', '长期记忆', '关系变化', '亲密陪伴'].map((item) => (
                  <EditorialPill key={item}>{item}</EditorialPill>
                ))}
              </Box>
              <Typography component="h1" sx={{ m: 0, maxWidth: 720, color: editorialInk, fontFamily: editorialSerif, fontWeight: 900, lineHeight: { xs: 1.06, md: 1 }, fontSize: { xs: 40, sm: 56, md: 74 }, letterSpacing: 0, animation: `editorialRise 760ms ${motion.crispOut} 80ms both` }}>
                一间房里，不止一个声音。
              </Typography>
              <Typography sx={{ mt: 2.2, maxWidth: 680, color: editorialMuted, lineHeight: 1.82, fontSize: { xs: 15.5, md: 17 } , animation: `editorialRise 760ms ${motion.crispOut} 150ms both` }}>
                你可以创建多个 AI 角色，让他们在同一间房里接话、插话、争论、玩笑。随着互动变多，角色会记住重要经历、形成关系印象，也逐渐拥有只属于你的陪伴细节。
              </Typography>
              <Stack direction="row" spacing={1.2} sx={{ mt: 3.2, flexWrap: 'wrap', gap: 1.2, animation: `editorialRise 760ms ${motion.crispOut} 220ms both` }}>
                <Button variant="contained" startIcon={<ForumOutlinedIcon />} onClick={() => navigate('/chats/create')} sx={{ borderRadius: 999, bgcolor: editorialAmber, color: '#FFF9F0', fontWeight: 850, px: 2.4, py: 1.15, boxShadow: '0 18px 38px rgba(143,70,24,0.22)', '&:hover': { bgcolor: editorialAmberDeep, transform: 'translateY(-3px)', boxShadow: '0 24px 46px rgba(143,70,24,0.28)' }, '&:active': { transform: 'translateY(-1px)' } }}>
                  开始群聊
                </Button>
                <Button variant="outlined" startIcon={<PersonAddAlt1Icon />} onClick={() => navigate('/characters/create')} sx={{ borderRadius: 999, color: editorialInk, borderColor: 'rgba(33,26,22,0.20)', fontWeight: 850, px: 2.4, py: 1.15, '&:hover': { borderColor: editorialAmber, bgcolor: 'rgba(201,111,37,0.08)', transform: 'translateY(-3px)' }, '&:active': { transform: 'translateY(-1px)' } }}>
                  创建角色
                </Button>
              </Stack>
            </Box>
          </Reveal>
          <Reveal delay={120}>
            <EditorialRoomStage activeKey={activeKey} onActive={setActiveKey} onInteractionChange={setPreviewPaused} />
          </Reveal>
        </Box>

        <Box sx={{ mx: { xs: -2, sm: -2.5, lg: -4 }, overflow: 'hidden', bgcolor: editorialCharcoal, color: '#FFF4E4' }}>
          <Box sx={{ display: 'flex', width: 'max-content', py: { xs: 1.2, md: 1.55 }, animation: 'editorialMarquee 26s linear infinite' }}>
            {Array.from({ length: 2 }).map((_, group) => (
              <Box key={group} sx={{ display: 'flex', alignItems: 'center' }}>
                {['Group chat', 'Character profile', 'Long memory', 'Relationship', 'Companionship'].map((item) => (
                  <Typography key={`${group}-${item}`} sx={{ mx: { xs: 2, md: 4 }, color: item === 'Group chat' ? '#E9A35A' : '#FFF4E4', fontFamily: editorialSerif, fontWeight: 850, fontSize: { xs: 30, md: 44 }, whiteSpace: 'nowrap' }}>
                    {item}
                  </Typography>
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 } }}>
          <Reveal>
            <Typography sx={{ color: editorialAmberDeep, fontFamily: monoStack, fontWeight: 850, fontSize: 12, letterSpacing: 1.1 }}>CORE EXPERIENCE</Typography>
            <Typography component="h2" sx={{ mt: 1.2, color: editorialInk, fontFamily: editorialSerif, fontWeight: 900, fontSize: { xs: 36, md: 58 }, lineHeight: 1.02 }}>
              先让群聊有层次，再让关系有回声。
            </Typography>
          </Reveal>
          <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            {editorialFeatures.map((item, index) => (
              <Reveal key={item.key} delay={index * 55}>
                <EditorialSurface sx={{ p: { xs: 2, md: 2.4 }, minHeight: 245, bgcolor: editorialSurface }}>
                  <Box sx={{ color: editorialAmber, '& svg': { fontSize: 30 } }}>{item.icon}</Box>
                  <Typography sx={{ mt: 1.35, color: editorialInk, fontFamily: editorialSerif, fontWeight: 900, fontSize: { xs: 30, md: 36 }, lineHeight: 1.04 }}>{item.title}</Typography>
                  <Typography sx={{ mt: 1.1, color: editorialMuted, lineHeight: 1.74, fontSize: 15.5 }}>{item.text}</Typography>
                </EditorialSurface>
              </Reveal>
            ))}
          </Box>
        </Box>

        <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.75fr 1.25fr' }, gap: { xs: 2.5, md: 4 }, alignItems: 'start' }}>
          <Reveal>
            <Box>
              <EditorialPill active>More capabilities</EditorialPill>
              <Typography component="h2" sx={{ mt: 2, color: editorialInk, fontFamily: editorialSerif, fontWeight: 900, fontSize: { xs: 38, md: 58 }, lineHeight: 1.02 }}>
                需要更多时，再打开工具层。
              </Typography>
              <Typography sx={{ mt: 1.6, color: editorialMuted, lineHeight: 1.78, fontSize: 16.5 }}>
                Agent、AI 中转站、朋友圈和日历都不是主角。它们补足任务、模型和日常痕迹，让多角色群聊有更多可延展的用法。
              </Typography>
            </Box>
          </Reveal>
          <Box sx={{ display: 'grid', gap: 1.2 }}>
            {editorialUtilities.map(([title, text, icon], index) => (
              <Reveal key={title} delay={index * 65}>
                <EditorialSurface sx={{ p: 1.8, display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gap: 1.4, alignItems: 'start', bgcolor: index === 0 ? '#27221F' : editorialSurface, color: index === 0 ? '#FFF4E4' : editorialInk }}>
                  <Box sx={{ color: index === 0 ? '#E9A35A' : editorialAmber, display: 'grid', '& svg': { fontSize: 25 } }}>{icon}</Box>
                  <Box>
                    <Typography sx={{ fontFamily: editorialSerif, fontWeight: 900, fontSize: 28, lineHeight: 1.05 }}>{title}</Typography>
                    <Typography sx={{ mt: 0.75, color: index === 0 ? '#D8C6AE' : editorialMuted, lineHeight: 1.66 }}>{text}</Typography>
                  </Box>
                </EditorialSurface>
              </Reveal>
            ))}
          </Box>
        </Box>

        <Reveal>
          <Box sx={{ py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center', borderTop: `1px solid ${editorialLine}` }}>
            <Box>
              <Typography sx={{ color: editorialInk, fontFamily: editorialSerif, fontWeight: 900, fontSize: { xs: 34, md: 52 }, lineHeight: 1.02 }}>从一个群聊开始。</Typography>
              <Typography sx={{ mt: 1.1, color: editorialMuted, lineHeight: 1.72 }}>先创建几个角色，让他们进入同一个话题。关系、记忆和陪伴细节，会在一次次互动里慢慢清晰。</Typography>
            </Box>
            <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/chats/create')} sx={{ justifySelf: { xs: 'start', md: 'end' }, borderRadius: 999, bgcolor: editorialAmber, color: '#FFF9F0', fontWeight: 850, px: 2.4, py: 1.15, boxShadow: '0 18px 38px rgba(143,70,24,0.22)', '&:hover': { bgcolor: editorialAmberDeep, transform: 'translateY(-3px)', boxShadow: '0 24px 46px rgba(143,70,24,0.28)' }, '&:active': { transform: 'translateY(-1px)' } }}>
              开始群聊
            </Button>
          </Box>
        </Reveal>
      </Box>
    </Box>
  );
}

export default EditorialIntroPage;

export function IntroConceptPage() {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const node = rootRef.current;
    if (!node) return;
    node.style.setProperty('--mx', `${event.clientX}px`);
    node.style.setProperty('--my', `${event.clientY}px`);
  };

  return (
    <Box
      ref={rootRef}
      onMouseMove={handleMouseMove}
      sx={{
        '--mx': '50vw',
        '--my': '20vh',
        minHeight: '100dvh',
        bgcolor: bg,
        color: '#F5F5F7',
        fontFamily: 'Inter, "SF Pro Display", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        position: 'relative',
        overflow: 'hidden',
        scrollBehavior: 'smooth',
        '&::before': {
          content: '""',
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          backgroundColor: 'transparent',
          zIndex: 0,
        },
        '&::after': {
          content: '""',
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: 'none',
          zIndex: 0,
        },
        '@keyframes introFloat': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        '@keyframes introOrbit': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        '@keyframes introPulse': {
          '0%, 100%': { transform: 'translateY(0)', opacity: 0.74 },
          '50%': { transform: 'translateY(-4px)', opacity: 1 },
        },
        '@keyframes heroOrbBreath': {
          '0%, 100%': {
            transform: 'scale(1)',
            borderColor: 'rgba(229,192,123,0.42)',
            boxShadow: '0 0 52px rgba(229,192,123,0.08), 0 0 80px rgba(0,0,0,0.16)',
          },
          '50%': {
            transform: 'scale(1.035)',
            borderColor: 'rgba(229,192,123,0.78)',
            boxShadow: '0 0 104px rgba(229,192,123,0.22), 0 0 128px rgba(0,0,0,0.22)',
          },
        },
        '@keyframes heroOrbWave': {
          '0%': { opacity: 0, transform: 'scale(0.58)' },
          '16%': { opacity: 0.86 },
          '100%': { opacity: 0, transform: 'scale(1.56)' },
        },
        '@keyframes heroOrbSpin': {
          '0%': { transform: 'rotate(0deg) scale(0.98)', opacity: 0.48 },
          '50%': { transform: 'rotate(180deg) scale(1.04)', opacity: 0.82 },
          '100%': { transform: 'rotate(360deg) scale(0.98)', opacity: 0.48 },
        },
        '@keyframes personaBreath': {
          '0%, 100%': { scale: 1, opacity: 0.82 },
          '50%': { scale: 1.08, opacity: 1 },
        },
        '@keyframes systemBreath': {
          '0%, 100%': { scale: 1, opacity: 0.78 },
          '50%': { scale: 1.06, opacity: 1 },
        },
        '@keyframes systemSlide': {
          '0%, 100%': { transform: 'translateX(0)', opacity: 0.72 },
          '50%': { transform: 'translateX(6px)', opacity: 1 },
        },
        '@keyframes systemBar': {
          '0%, 100%': { transform: 'scaleX(0.86)', transformOrigin: 'left center', opacity: 0.72 },
          '50%': { transform: 'scaleX(1)', opacity: 1 },
        },
        '@keyframes systemFloatSmall': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        '@keyframes ripplePulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(229,192,123,0.30)' },
          '100%': { boxShadow: '0 0 0 18px rgba(229,192,123,0)' },
        },
        '@keyframes titleCursorBlink': {
          '0%, 45%': { opacity: 1 },
          '46%, 100%': { opacity: 0 },
        },
        '@keyframes metricRipple': {
          '0%': { opacity: 0.58, transform: 'scale(0.72)' },
          '100%': { opacity: 0, transform: 'scale(1.38)' },
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, width: 'min(1180px, calc(100% - 32px))', mx: 'auto', py: { xs: 2, md: 3 } }}>
        <Box sx={{ position: 'sticky', top: 12, zIndex: 5, mb: { xs: 4, md: 6 }, display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${border}`, borderRadius: 2, px: 2, py: 1, bgcolor: 'rgba(10,10,15,0.58)', backdropFilter: 'blur(18px)' }}>
          <Typography sx={{ fontWeight: 760, letterSpacing: 0, color: '#fff' }}>Sense Murmur</Typography>
          <Stack direction="row" spacing={0.5}>
            {navItems.map(([id, label]) => (
              <Button key={id} size="small" onClick={() => scrollToSection(id)} sx={{ color: 'rgba(255,255,255,0.62)', borderRadius: 1.5, px: 1.25, '&:hover': { color: '#0A0A0F', bgcolor: accent } }}>
                {label}
              </Button>
            ))}
          </Stack>
        </Box>

        <Box id="world" sx={{ minHeight: { xs: 'auto', lg: 'min(760px, calc(100dvh - 96px))' }, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.03fr) minmax(0, 0.97fr)' }, gap: { xs: 4, lg: 6 }, alignItems: 'center', pt: { xs: 1, md: 2 }, pb: { xs: 5, md: 7 } }}>
          <Reveal>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: { xs: 4, md: 5, lg: 7 } }}>
                {['AI 多角色互动房间', '长期记忆与关系连续性', '群聊 / 单聊 / AI 私聊'].map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    variant="outlined"
                    sx={{
                      color: 'rgba(255,255,255,0.82)',
                      borderColor: 'rgba(255,255,255,0.18)',
                      bgcolor: 'rgba(255,255,255,0.05)',
                      height: { xs: 38, md: 42 },
                      px: { xs: 0.75, md: 1.1 },
                      '& .MuiChip-label': {
                        px: { xs: 1.1, md: 1.6 },
                        fontSize: { xs: 14, md: 16 },
                        fontWeight: 620,
                        lineHeight: 1.25,
                        letterSpacing: 0.2,
                      },
                    }}
                  />
                ))}
              </Stack>
              <AnimatedHeroTitle />
              <Typography sx={{ mt: { xs: 2, md: 2.25 }, maxWidth: 720, color: 'rgba(255,255,255,0.62)', lineHeight: 1.85, fontSize: { xs: 16, md: 18 } }}>
                Sense Murmur 不是把 AI 放进聊天框，而是让多个 AI 角色在房间里持续相处。你创建角色、让他们群聊或单聊；关系、记忆、情绪和旧经历会回流到下一次对话里。
              </Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: { xs: 4, lg: 6 }, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => navigate('/characters/create')}
                  sx={{ width: 'fit-content', minWidth: 0, borderRadius: 2, px: 3, py: 1.25, bgcolor: accent, color: '#0A0A0F', fontWeight: 760, boxShadow: 'none', '&:hover': { bgcolor: '#F5F5F7', color: '#0A0A0F', animation: 'ripplePulse 520ms ease-out' } }}
                >
                  创建角色
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => navigate('/chats/create')}
                  sx={{ width: 'fit-content', minWidth: 0, borderRadius: 2, px: 3, py: 1.25, borderColor: 'rgba(255,255,255,0.22)', color: '#F5F5F7', '&:hover': { borderColor: accent, bgcolor: accent, color: '#0A0A0F' } }}
                >
                  开始一个房间
                </Button>
              </Stack>
            </Box>
          </Reveal>
          <Reveal delay={120}>
            <Box sx={{ minWidth: 0 }}>
              <HeroVisual />
            </Box>
          </Reveal>
        </Box>

        <FeatureGrid />
        <MockGroupChatSnapshot />

        <MemoryContinuitySection />

        <EngineSection />

        <RuntimeSystemSection />

        <Box id="craft" sx={{ py: { xs: 5, md: 7 } }}>
          <Reveal>
            <GlassCard sx={{ p: { xs: 2.5, md: 3.25 }, overflow: 'hidden', position: 'relative' }}>
              <Box sx={{ position: 'absolute', right: -120, top: -140, width: 360, height: 360, borderRadius: '50%', border: '1px solid rgba(229,192,123,0.12)' }} />
              <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '0.78fr 1.22fr' }, gap: { xs: 4, md: 6 } }}>
                <Box>
                  <TimelineIcon sx={{ color: accent, fontSize: 34, mb: 2 }} />
                  <Typography sx={{ fontWeight: 840, lineHeight: { xs: 1.16, md: 1.12 }, fontSize: { xs: 32, md: 48 }, color: '#F8F8FA' }}>
                    所有复杂度，都在<Box component="span" sx={{ color: accent }}>守护</Box>这种延续。
                  </Typography>
                  <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.58)', lineHeight: 1.85 }}>
                    角色不该每次都从零开始。线程、账本、记忆、事件和房间规则，最后都指向同一件事：让你创建的角色能被带进新的场景，并仍然知道“我是我”。
                  </Typography>
                </Box>
                <CraftContinuityPanel />
              </Box>
            </GlassCard>
          </Reveal>
        </Box>

        <Reveal>
          <Box sx={{ py: { xs: 6, md: 8 }, textAlign: 'center' }}>
            <PsychologyIcon sx={{ color: accent, fontSize: 34, mb: 2 }} />
            <Typography sx={{ mx: 'auto', maxWidth: 880, fontWeight: 850, lineHeight: { xs: 1.15, md: 1.1 }, fontSize: { xs: 34, md: 56 }, color: '#F8F8FA' }}>
              我们不是在制造更聪明的回复者，而是在尝试让一个虚构角色拥有<Box component="span" sx={{ color: accent }}>来处、牵挂和未完成</Box>。
            </Typography>
            <Typography sx={{ mx: 'auto', mt: 2.5, maxWidth: 760, color: 'rgba(255,255,255,0.58)', lineHeight: 1.85 }}>
              人除了物质之外，还由记忆、关系、选择、羞耻、偏爱、承诺和未完成组成。Sense Murmur 想做的，是让你创建的角色也能在群聊、单聊和未来的房间里，慢慢长出形状。
            </Typography>
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate('/')}
              sx={{ mt: 4, borderRadius: 2, px: 3.5, py: 1.35, bgcolor: '#F5F5F7', color: '#0A0A0F', fontWeight: 800, boxShadow: 'none', '&:hover': { bgcolor: accent, animation: 'ripplePulse 520ms ease-out' } }}
            >
              进入 Sense Murmur
            </Button>
          </Box>
        </Reveal>
      </Box>
    </Box>
  );
}
