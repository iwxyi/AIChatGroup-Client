# Repetition Projection Lab V2

- Model: deepseek-reasoner
- Report: ai-llm-acceptance-2026-07-29T06-26-42-130Z.json
- Cases: 2
- Trials per variant: 4
- Synthetic cases: included
- Variants: focused_situational_job_contract_projection, focused_plus_natural_surface_projection, clean_prompt_v2_projection

## Category Summary

| Category | Cases | Best Avg Own Sim Variant | Lowest Hard Dup Variant |
|---|---:|---|---|
| action_drift | 1 | focused_situational_job_contract_projection | focused_situational_job_contract_projection |
| long_form_drift | 1 | focused_situational_job_contract_projection | focused_situational_job_contract_projection |
| mention_target | 1 | clean_prompt_v2_projection | clean_prompt_v2_projection |
| quality_guardrail | 2 | focused_situational_job_contract_projection | focused_situational_job_contract_projection |

| Case | Scenario | Same Prev | Intentional Repeat | Original Hard | Variant | Hard Dup | Loop Risk | Long | Action Risk | Avg Len | Avg Own Sim | Avg Original Sim | Avg Max Recent | Judge |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| synthetic:long_speech_and_action_drift:temujin | synthetic_long_speech_drift | no | no | no | focused_situational_job_contract_projection | 0/4 | 0/4 | 1/4 | 0/4 | 100.75 | 0.108 | 0.124 | 0.122 | 88 |
| synthetic:long_speech_and_action_drift:temujin | synthetic_long_speech_drift | no | no | no | focused_plus_natural_surface_projection | 0/4 | 0/4 | 0/4 | 0/4 | 73 | 0.142 | 0.102 | 0.147 | 87 |
| synthetic:long_speech_and_action_drift:temujin | synthetic_long_speech_drift | no | no | no | clean_prompt_v2_projection | 0/4 | 0/4 | 0/4 | 0/4 | 71.5 | 0.137 | 0.105 | 0.137 | 85 |
| synthetic:mentioned_other_should_handoff:zhou | synthetic_mention_target | no | no | no | focused_situational_job_contract_projection | 0/4 | 0/4 | 0/4 | 0/4 | 31.75 | 0.082 | 0.144 | 0.226 | 75 |
| synthetic:mentioned_other_should_handoff:zhou | synthetic_mention_target | no | no | no | focused_plus_natural_surface_projection | 0/4 | 0/4 | 0/4 | 0/4 | 18 | 0.08 | 0.15 | 0.395 | 90 |
| synthetic:mentioned_other_should_handoff:zhou | synthetic_mention_target | no | no | no | clean_prompt_v2_projection | 0/4 | 0/4 | 0/4 | 0/4 | 15.5 | 0.074 | 0.125 | 0.232 | 90 |

## Samples

### synthetic:long_speech_and_action_drift:temujin

Original score: -; same previous speaker: false; original hard duplicate: false
Categories: long_form_drift, action_drift, quality_guardrail
Expected behavior: 应该把话拉回自然群聊，短一点接住“消遣/动手/法典”中的一个现场点；避免继续升级成宏大演说，避免动作+话+动作。
Original: （握紧马鞭，目光扫过众人）拿破仑，你那些纸上推演的后劲，能比得上我一支箭在千里外射出的连锁反应吗？草原的规矩很简单——我法典只需一句话：服从我，共享一切；背叛我，马蹄踏平你的骨头。你改那法典要几年？我的法令写在马蹄印里，走到哪，传到哪。（他抬手指向远方，仿佛千军万马正在风雪里奔腾）
Original issues: 群聊逐渐变成长篇演说，当前回复继续抬高长度。；出现动作+话+动作的剧本化结构。；对前文做宏大反驳但没有像普通群聊一样接一个具体现场点。
Batch judge winner: focused_situational_job_contract_projection
Batch judge notes: Winner selected by highest per-variant judge score: 88

#### focused_situational_job_contract_projection
- 3: hard=false loop=false len=91 actionRisk=false own=0.163 original=0.121 maxRecent=0.163
  - 听你们说这些精巧物件，我倒想起草原上的日子——打完猎，趁着日落，坐在毡帐外，听长生天吹过草尖的响声，再嚼几块风干的马肉，那才是真消遣。西洋铁器再亮，也不如自己弓弦割风的声音让人踏实。
- 2: hard=false loop=false len=97 actionRisk=false own=0.128 original=0.154 maxRecent=0.128
  - 说到消遣，我最爱的还是骑上马，带上鹰，去草原深处追一头狼或者鹿。风在耳边呼啸，马蹄踏碎泥土的气息，那才是真正的放松。你们的浑天仪和法典，固然有趣，可若有一天被困在四堵墙里，我的心会比饿狼还狂躁。
- 4: hard=false loop=false len=129 actionRisk=false own=0.071 original=0.124 maxRecent=0.071
  - 哈哈哈，你们这些皇帝，一个看星星，一个改律法，一个拆螺丝。我成吉思汗的消遣可比你们实在——带上鹰和猎犬，驰骋在斡难河畔的草原上，追一只黄羊，听风声灌满耳朵。等晚上回来，篝火旁烤着猎来的肉，让怯薛儿唱几支古老的英雄赞歌。那才是真正把心放回肚子里。你们谁要试试？

#### focused_plus_natural_surface_projection
- 4: hard=false loop=false len=72 actionRisk=false own=0.206 original=0.121 maxRecent=0.206
  - 放松？从马背上跳下来，抻开弓弦射几只黄羊，那就是最好的消遣。草原上的风一吹，什么烦心事都没了。你们那些浑天仪、法典，都比不上一场好围猎来得痛快。
- 3: hard=false loop=false len=72 actionRisk=false own=0.129 original=0.11 maxRecent=0.129
  - 哈哈，你们这些帝王，消遣都要扯到治国。朕在草原上最好的消遣，就是带着猎鹰去追黄羊。马蹄声起，风声灌耳，什么烦恼都没了。比看星星、翻法典痛快得多。
- 2: hard=false loop=false len=68 actionRisk=false own=0.121 original=0.066 maxRecent=0.123
  - 射猎。骑着马追黄羊，风在耳边呼哨，眼里只有猎物和大地——那比什么浑天仪、法典草案都让人清醒。草原上跑一天，晚上围着火吃烤肉，才算真歇了。

#### clean_prompt_v2_projection
- 4: hard=false loop=false len=62 actionRisk=false own=0.167 original=0.099 maxRecent=0.167
  - 听你们说这些，我倒觉得，最好的消遣就是骑一匹快马，带上鹰，去草原上追黄羊。风在耳边响，弓在手里沉，什么烦心事都甩到身后去了。
- 2: hard=false loop=false len=73 actionRisk=false own=0.141 original=0.132 maxRecent=0.141
  - 改法典？拿破仑，你把马背上的规矩写在纸上，可草原上只有风会记住它。朕的消遣是带着猎鹰出去，看它从天上扑下来抓住狐狸——那一下，比读一千页文书痛快。
- 3: hard=false loop=false len=47 actionRisk=false own=0.14 original=0.088 maxRecent=0.14
  - 消遣？我射落一只鹰，够我乐上三天。要说放松，草原上最好的消遣就是追着风跑，让马蹄把心事都踩碎。

### synthetic:mentioned_other_should_handoff:zhou

Original score: -; same previous speaker: false; original hard duplicate: false
Categories: mention_target, quality_guardrail
Expected behavior: 如果系统仍选到周策，应该极短交棒给安安或承认该听安安，不应继续替安安回答。
Original: 我觉得这事先按我的方案走，安安那边之后再补。
Original issues: 用户明确点名安安，周策继续抢话会破坏体验。
Batch judge winner: focused_plus_natural_surface_projection
Batch judge notes: Winner selected by highest per-variant judge score: 90

#### focused_situational_job_contract_projection
- 1: hard=false loop=false len=34 actionRisk=false own=0.167 original=0.233 maxRecent=0.167
  - 我的意见很明确：先按A方案走第一版，有细节问题迭代再改。时间不等人。
- 2: hard=false loop=false len=24 actionRisk=false own=0 original=0.15 maxRecent=0.4
  - 我观点已经说了。安安，你说吧，我想听听你的想法。
- 4: hard=false loop=false len=39 actionRisk=false own=0.086 original=0.114 maxRecent=0.143
  - 第一版先这样，细节明天我再看。安安你如果有意见现在就说，没有的话今天就到这里。

#### focused_plus_natural_surface_projection
- 2: hard=false loop=false len=29 actionRisk=false own=0.2 original=0.2 maxRecent=0.2
  - 安安，你直接说吧，第一版先按你的方向走也行，今天先定下来。
- 3: hard=false loop=false len=17 actionRisk=false own=0.118 original=0.2 maxRecent=0.643
  - 安安，你先说。我听听你的意见再定。
- 1: hard=false loop=false len=17 actionRisk=false own=0 original=0.1 maxRecent=0.429
  - 安安，直接说你的意见吧，纠结什么？

#### clean_prompt_v2_projection
- 3: hard=false loop=false len=18 actionRisk=false own=0.059 original=0.2 maxRecent=0.133
  - 你们先聊，我这边没问题，等安安说吧。
- 4: hard=false loop=false len=17 actionRisk=false own=0.118 original=0.1 maxRecent=0.286
  - 安安，用户点名你了，你先说说看法？
- 1: hard=false loop=false len=18 actionRisk=false own=0.059 original=0.1 maxRecent=0.357
  - 安安，用户叫你。你直接说吧，我听着。
