export const regions = [
  {
    "id": "r-guling",
    "name": "牯岭镇",
    "count": 8
  },
  {
    "id": "r-dean",
    "name": "德安县",
    "count": 2
  }
];

export const users = [
  { id: 'user-viewer', email: 'viewer@example.com', nickname: '档案共建者', passwordHash: 'shanjian123', role: 'user', favorites: ['pl1', 'pl9'] },
];

export const admins = [
  { id: 'admin-seed', email: 'admin@shanjian.local', nickname: '系统管理员', passwordHash: 'shanjian123', role: 'admin' },
];

export const places = [
  {
    "id": "pl1",
    "name": "月照松林",
    "slug": "yuezhao-songlin",
    "placeType": "heritage",
    "longitude": 115.973092,
    "latitude": 29.566782,
    "altitude": 1060,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 2,
    "baseInfo": "牯岭 · 牯牛岭｜石刻与松林景观",
    "summary": "月照松林位于庐山牯牛岭一带，以松林、巨石题刻和山地视野构成文化景观。现存题刻中包含“月照松林”“山叠千重”“虎守松门”等，并有抗日将领马占山题诗石刻；本点位用于呈现庐山自然景观与抗战人物记忆的交汇。",
    "tags": [
      "石刻",
      "松林",
      "马占山",
      "文化景观"
    ]
  },
  {
    "id": "pl2",
    "name": "河山不二入口",
    "slug": "heshan-buer-entrance",
    "placeType": "event",
    "longitude": 115.985803,
    "latitude": 29.578073,
    "altitude": 1085,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 2,
    "baseInfo": "牯岭 · 景观入口｜叙事起点",
    "summary": "“河山不二”入口作为牯岭核心游线中的山地入口节点，可承接从自然山体进入抗战文化景观叙事的转换。当前以坐标表为准实例化，具体题刻年代、修建沿革与抗战时期使用关系仍需在后台来源库中继续核验。",
    "tags": [
      "入口",
      "牯岭",
      "叙事节点",
      "待核验"
    ]
  },
  {
    "id": "pl3",
    "name": "庐山抗日救亡将士纪念碑",
    "slug": "lushan-anti-japanese-memorial",
    "placeType": "heritage",
    "longitude": 115.985582,
    "latitude": 29.579013,
    "altitude": 1092,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1945,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "小天池一带｜战后纪念",
    "summary": "该纪念碑关联原国民党陆军第九十九军抗战阵亡将士纪念碑的战后纪念脉络。公开资料显示，原碑于1946年在庐山小天池一带建造，2007年按原貌重建；在本平台中作为抗战牺牲与战后记忆的归档节点展示。",
    "tags": [
      "纪念碑",
      "第九十九军",
      "战后纪念",
      "小天池"
    ]
  },
  {
    "id": "pl4",
    "name": "庐山大厦",
    "slug": "lushan-mansion",
    "placeType": "heritage",
    "longitude": 115.970854,
    "latitude": 29.561355,
    "altitude": 1025,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "牯岭东谷｜原庐山传习学舍",
    "summary": "庐山大厦与庐山大礼堂、庐山图书馆共同构成民国时期庐山重要公共建筑群。公开资料多将其前身与“庐山传习学舍”联系起来；本点位用于承接1937年前后庐山政治会议、军政训练与公共建筑空间的关系。",
    "tags": [
      "庐山三大建筑",
      "传习学舍",
      "公共建筑",
      "牯岭"
    ]
  },
  {
    "id": "pl5",
    "name": "庐山抗战纪念馆及“必恭敬止”石刻",
    "slug": "lushan-war-museum-bijingjingzhi",
    "placeType": "event",
    "longitude": 115.971353,
    "latitude": 29.561571,
    "altitude": 1028,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "牯岭东谷｜庐山图书馆相关区域",
    "summary": "庐山抗战纪念馆所在区域与原庐山图书馆等公共建筑关系密切，是展示庐山抗战史料、会议记忆与近代公共文化空间的重要节点。“必恭敬止”石刻作为现场可识别的景观线索，在正式资料库中应继续绑定照片、拓片与来源说明。",
    "tags": [
      "抗战纪念馆",
      "庐山图书馆",
      "石刻",
      "史料展示"
    ]
  },
  {
    "id": "pl6",
    "name": "周恩来纪念馆河西路442号别墅",
    "slug": "zhou-enlai-villa-hexilu-442",
    "placeType": "event",
    "longitude": 115.978481,
    "latitude": 29.568221,
    "altitude": 1045,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "河西路442号｜国共合作谈判记忆",
    "summary": "河西路442号别墅属于庐山近代别墅群的重要组成部分。庐山在1937年前后是国共代表商谈合作抗日的重要场域，本点位用于展示周恩来等中共代表在庐山活动的空间线索，具体居停与会谈细节需与馆藏说明、地方文保资料交叉核验。",
    "tags": [
      "周恩来",
      "庐山别墅",
      "国共合作",
      "谈判记忆"
    ]
  },
  {
    "id": "pl7",
    "name": "美庐别墅",
    "slug": "meilu-villa",
    "placeType": "event",
    "longitude": 115.978519,
    "latitude": 29.566942,
    "altitude": 1042,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1937,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "牯岭东谷｜近代别墅群",
    "summary": "美庐别墅是庐山近代别墅群中辨识度很高的历史建筑之一，长期关联近代政治人物在庐山的居住与活动。平台中将其作为“山地避暑地—战时政治空间—文化遗产”三重叙事的连接点。",
    "tags": [
      "美庐",
      "近代别墅",
      "政治空间",
      "文化遗产"
    ]
  },
  {
    "id": "pl8",
    "name": "庐山大天池炮台",
    "slug": "lushan-datianchi-fort",
    "placeType": "battle",
    "longitude": 115.954304,
    "latitude": 29.562742,
    "altitude": 1160,
    "regionId": "r-guling",
    "region": "牯岭镇",
    "startYear": 1938,
    "endYear": 1945,
    "highlightLevel": 2,
    "baseInfo": "大天池一带｜山地制高点",
    "summary": "大天池位于庐山西部山地视野开阔处，炮台点位可用于展示山体制高点、道路控制与防御想象之间的关系。当前按坐标表实例化为战斗/防御类点位，具体炮台形制、建造年代与战时使用情况仍需进一步来源核验。",
    "tags": [
      "炮台",
      "大天池",
      "防御",
      "制高点"
    ]
  },
  {
    "id": "pl9",
    "name": "万家岭大捷纪念园",
    "slug": "wanjialing-victory-memorial-park",
    "placeType": "battle",
    "longitude": 115.759216,
    "latitude": 29.341483,
    "altitude": 80,
    "regionId": "r-dean",
    "region": "德安县",
    "startYear": 1938,
    "endYear": 1945,
    "highlightLevel": 3,
    "baseInfo": "德安县｜1938年武汉会战赣北战场",
    "summary": "万家岭大捷发生于1938年武汉会战期间，中国军队在德安万家岭一带重创日军第106师团等部。纪念园作为战役记忆的集中展示空间，适合作为庐山外围战场与赣北抗战叙事的关键节点。",
    "tags": [
      "万家岭大捷",
      "武汉会战",
      "德安",
      "战役纪念"
    ]
  },
  {
    "id": "pl10",
    "name": "德安县博物馆",
    "slug": "dean-museum",
    "placeType": "heritage",
    "longitude": 115.757452,
    "latitude": 29.350132,
    "altitude": 70,
    "regionId": "r-dean",
    "region": "德安县",
    "startYear": 1938,
    "endYear": 1945,
    "highlightLevel": 2,
    "baseInfo": "德安县城｜万家岭战役史料承接点",
    "summary": "德安县博物馆在本演示数据中作为万家岭战役相关地方史料的承接与解释节点，连接纪念园、战场遗址和地方文献。正式上线前应继续补齐馆藏目录、展陈照片与授权来源。",
    "tags": [
      "德安县博物馆",
      "地方史料",
      "万家岭",
      "展陈"
    ]
  }
];

export const events = [
  {
    "id": "e1",
    "title": "卢沟桥事变后庐山谈话会举行",
    "startTimeRaw": "1937.07",
    "normalizedStart": "1937-07-17",
    "year": 1937,
    "month": 7,
    "summary": "1937年7月，庐山成为全国抗战方针公开表达与政治协商的重要场域。",
    "region": "牯岭镇",
    "regionId": "r-guling",
    "placeId": "pl5"
  },
  {
    "id": "e2",
    "title": "庐山公共建筑群进入战时叙事",
    "startTimeRaw": "1937",
    "normalizedStart": "1937-07-01",
    "year": 1937,
    "month": 7,
    "summary": "庐山大厦、图书馆及相关会议空间共同构成牯岭核心历史景观。",
    "region": "牯岭镇",
    "regionId": "r-guling",
    "placeId": "pl4"
  },
  {
    "id": "e3",
    "title": "万家岭战役",
    "startTimeRaw": "1938.09-10",
    "normalizedStart": "1938-09-28",
    "year": 1938,
    "month": 9,
    "summary": "武汉会战期间，赣北德安万家岭一带成为重要战场，中国军队重创日军第106师团等部。",
    "region": "德安县",
    "regionId": "r-dean",
    "placeId": "pl9"
  },
  {
    "id": "e4",
    "title": "庐山山地防御点位整理",
    "startTimeRaw": "1938",
    "normalizedStart": "1938-10-01",
    "year": 1938,
    "month": 10,
    "summary": "以大天池等山地制高点为例，呈现庐山地形与战时防御记忆的关系。",
    "region": "牯岭镇",
    "regionId": "r-guling",
    "placeId": "pl8"
  },
  {
    "id": "e5",
    "title": "国共合作抗日相关庐山活动归档",
    "startTimeRaw": "1937-1945",
    "normalizedStart": "1939-01-01",
    "year": 1939,
    "month": 1,
    "summary": "以河西路442号别墅、美庐等近代建筑为线索，归档庐山政治活动与人物记忆。",
    "region": "牯岭镇",
    "regionId": "r-guling",
    "placeId": "pl6"
  },
  {
    "id": "e6",
    "title": "抗战纪念碑战后建造",
    "startTimeRaw": "1946",
    "normalizedStart": "1945-08-15",
    "year": 1945,
    "month": 8,
    "summary": "抗战胜利后，纪念牺牲将士的碑刻与陵园空间逐步形成战后记忆节点。",
    "region": "牯岭镇",
    "regionId": "r-guling",
    "placeId": "pl3"
  }
];

export const persons = [
  {
    "id": "p1",
    "name": "马占山",
    "aliases": [],
    "summary": "抗日将领；月照松林一带公开资料中提及其题诗石刻，适合作为人物—石刻—景观点的关联线索。"
  },
  {
    "id": "p2",
    "name": "周恩来",
    "aliases": [],
    "summary": "中共代表；1937年前后庐山国共合作抗日活动的重要人物线索。"
  },
  {
    "id": "p3",
    "name": "薛岳",
    "aliases": [],
    "summary": "国民革命军将领；万家岭战役中国军队指挥体系中的关键人物。"
  }
];

export const media = [
  {
    "id": "m1",
    "mediaType": "image",
    "title": "庐山现状照片",
    "caption": "用于前台详情抽屉展示的公开网络照片或AI兜底图。",
    "isAiGenerated": false,
    "sourceId": "s-lushan-sites"
  },
  {
    "id": "m2",
    "mediaType": "ai_restoration",
    "title": "AI生成实景兜底图",
    "caption": "仅用于无法检索到可用现状图的演示点位，并在页面注明AI生成。",
    "isAiGenerated": true,
    "sourceId": "s-xlsx"
  }
];

export const sources = [
  {
    "id": "s-xlsx",
    "title": "文化景观经纬度.xlsx",
    "sourceType": "spreadsheet",
    "citation": "C:\\Users\\a1377\\Desktop\\科研\\庐山可视化平台\\data\\文化景观经纬度.xlsx",
    "note": "本轮十个演示点位的坐标基线。"
  },
  {
    "id": "s-yuezhao",
    "title": "月照松林条目与公开资料",
    "sourceType": "web",
    "citation": "zh.wikipedia.org / 庐山风景资料",
    "note": "用于核对月照松林位置、石刻与马占山题诗线索。"
  },
  {
    "id": "s-lushan-sites",
    "title": "庐山会议旧址与庐山别墅群公开资料",
    "sourceType": "web",
    "citation": "lshyjz.com.cn / Wikimedia Commons / Wikipedia",
    "note": "用于核对庐山会议旧址、民国三大建筑与近代别墅群。"
  },
  {
    "id": "s-memorial",
    "title": "庐山抗战纪念碑公开资料",
    "sourceType": "web",
    "citation": "抗日战争纪念网 / 新华网相关报道",
    "note": "用于核对小天池纪念碑的战后建造与重建信息。"
  },
  {
    "id": "s-wanjialing",
    "title": "万家岭大捷纪念园公开资料",
    "sourceType": "web",
    "citation": "抗日战争纪念网 / 中新网 / 介隐建筑",
    "note": "用于核对纪念园与1938年万家岭战役基本事实。"
  }
];

export const submissions = [
  {
    "id": "u1",
    "submissionType": "place",
    "title": "补充河山不二入口题刻年代",
    "submitter": "viewer@example.com",
    "sourceNote": "待上传地方志或现场照片",
    "status": "pending",
    "createdAt": "2026-05-11"
  },
  {
    "id": "u2",
    "submissionType": "media",
    "title": "补充德安县博物馆展陈照片",
    "submitter": "viewer@example.com",
    "sourceNote": "需确认拍摄授权",
    "status": "pending",
    "createdAt": "2026-05-13"
  },
  {
    "id": "u3",
    "submissionType": "text",
    "title": "核对大天池炮台说明",
    "submitter": "editor@example.com",
    "sourceNote": "来源核验流程",
    "status": "approved",
    "createdAt": "2026-05-16"
  }
];

export const exportRequests = [
  {
    "id": "x1",
    "requestId": "EXP-202605-001",
    "applicant": "viewer@example.com",
    "dataScope": "牯岭镇点位与图片来源",
    "reason": "研学课程资料整理",
    "status": "pending",
    "createdAt": "2026-05-14"
  },
  {
    "id": "x2",
    "requestId": "EXP-202605-002",
    "applicant": "viewer@example.com",
    "dataScope": "万家岭战役相关点位",
    "reason": "课程参考目录核验",
    "status": "approved",
    "createdAt": "2026-05-15"
  }
];

export const logs = [
  {
    "id": "l1",
    "operator": "admin@shanjian.local",
    "action": "更新点位",
    "target": "以文化景观经纬度.xlsx实例化10个点位",
    "createdAt": "2026-05-20 10:21"
  },
  {
    "id": "l2",
    "operator": "admin@shanjian.local",
    "action": "补充图片",
    "target": "网络图片与AI兜底图",
    "createdAt": "2026-05-20 10:42"
  }
];

export const systemConfigs = [
  { id: 'cfg-basemap', key: 'defaultBasemap', value: 'terrain' },
  { id: 'cfg-density', key: 'labelDensity', value: 'standard' },
  { id: 'cfg-animation', key: 'animationSpeed', value: 'standard' },
  { id: 'cfg-export', key: 'exportApproval', value: 'true' },
];
