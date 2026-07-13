import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HubIcon from '@mui/icons-material/Hub';
import ScienceIcon from '@mui/icons-material/Science';
import MemoryIcon from '@mui/icons-material/Memory';
import ForumIcon from '@mui/icons-material/Forum';
import TimelineIcon from '@mui/icons-material/Timeline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';

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
    text: 'Pneumata 的基本形态是一间互动房间。多个 AI 角色共享同一段时间，插话、沉默、维护和站边都会改变房间的空气。',
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
          如果一个角色没有身体，它还能凭什么像一个存在？Pneumata 用同一套角色本体承载群聊、单聊、AI 私聊和未来的故事房，让不同房间里的经历继续汇到同一个它身上。
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
            <Typography sx={{ width: '100%', color: '#F8F8FA', fontWeight: 820, fontSize: { xs: 22, sm: 27 }, lineHeight: 1, letterSpacing: 0, textAlign: 'center', whiteSpace: 'nowrap' }}>Pneumata</Typography>
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

const introHeroTitle = '生息：Pneumata';
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

export default function IntroPage() {
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
          <Typography sx={{ fontWeight: 760, letterSpacing: 0, color: '#fff' }}>Pneumata</Typography>
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
                Pneumata 不是把 AI 放进聊天框，而是让多个 AI 角色在房间里持续相处。你创建角色、让他们群聊或单聊；关系、记忆、情绪和旧经历会回流到下一次对话里。
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
              人除了物质之外，还由记忆、关系、选择、羞耻、偏爱、承诺和未完成组成。Pneumata 想做的，是让你创建的角色也能在群聊、单聊和未来的房间里，慢慢长出形状。
            </Typography>
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate('/')}
              sx={{ mt: 4, borderRadius: 2, px: 3.5, py: 1.35, bgcolor: '#F5F5F7', color: '#0A0A0F', fontWeight: 800, boxShadow: 'none', '&:hover': { bgcolor: accent, animation: 'ripplePulse 520ms ease-out' } }}
            >
              进入 Pneumata
            </Button>
          </Box>
        </Reveal>
      </Box>
    </Box>
  );
}
