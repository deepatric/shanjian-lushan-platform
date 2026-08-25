from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import pandas as pd
from docx import Document


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

BATCH_KEY = "lushan-platform-2026-07"


def q(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def qjson(value: Any) -> str:
    return q(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def payload_hash(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def stable_id(prefix: str, text: str) -> str:
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


KNOWN_SLUGS = {
    "月照松林": "yuezhao-songlin",
    "河山不二入口": "heshan-buer-entrance",
    "庐山抗日救亡将士纪念碑": "lushan-anti-japanese-memorial",
    "庐山抗战阵亡将士纪念碑": "lushan-anti-japanese-memorial",
    "庐山大厦": "lushan-mansion",
    "庐山抗战纪念馆以及“必恭敬止”石刻": "lushan-war-museum-bijingjingzhi",
    "庐山抗战纪念馆及“必恭敬止”石刻": "lushan-war-museum-bijingjingzhi",
    "周恩来纪念馆河西路442号别墅": "zhou-enlai-villa-hexilu-442",
    "河西路442号别墅": "hexilu-442-villa",
    "美庐别墅": "meilu-villa",
    "庐山大天池炮台": "lushan-datianchi-fort",
    "万家岭大捷纪念园": "wanjialing-victory-memorial-park",
    "德安县博物馆": "dean-museum",
    "八一南昌起义纪念塔": "bayi-nanchang-uprising-memorial-tower",
    "中共中央东南分局旧址": "southeast-bureau-site",
    "马当炮台遗址": "madang-fort-site",
    "庐山抗战博物馆（原庐山图书馆）": "lushan-war-museum-library",
    "庐山抗战博物馆": "lushan-war-museum-library",
    "中共赣北工委与游击大队旧址": "north-jiangxi-party-guerrilla-site",
    "柴桑区烈士陵园": "chaisang-martyrs-cemetery",
}


def slugify(name: str) -> str:
    clean = name.strip()
    return KNOWN_SLUGS.get(clean) or stable_id("item", clean)


def region_for(lng: float, lat: float, name: str) -> tuple[str, str]:
    if "南昌" in name or lat < 29:
        return "region-nanchang", "南昌市"
    if "德安" in name or (115.70 <= lng <= 115.85 and 29.30 <= lat <= 29.42):
        return "region-dean", "德安县"
    if "彭泽" in name or lng > 116.45:
        return "region-pengze", "彭泽县"
    if "都昌" in name:
        return "region-duchang", "都昌县"
    if "修水" in name:
        return "region-xiushui", "修水县"
    if "柴桑" in name or "岷山" in name:
        return "region-chaisang", "柴桑区"
    return "region-guling", "庐山牯岭及周边"


@dataclass
class Coord:
    label: str
    lng: float
    lat: float
    precision: str
    confidence: str
    note: str


class LocationCatalog:
    def __init__(self) -> None:
        self.items: dict[str, Coord] = {}

    def add(
        self,
        label: str,
        lng: float,
        lat: float,
        precision: str = "site",
        confidence: str = "medium",
        note: str = "",
        aliases: list[str] | None = None,
    ) -> None:
        coord = Coord(label, lng, lat, precision, confidence, note)
        for key in [label, *(aliases or [])]:
            key = normalize_location_key(key)
            if key:
                self.items[key] = coord

    def find(self, text: str) -> Coord | None:
        source = normalize_location_key(text)
        if not source:
            return None
        # Prefer the most specific alias.
        for key in sorted(self.items, key=len, reverse=True):
            if key and key in source:
                coord = self.items[key]
                if coord.precision in {"exact", "road", "village", "site", "scenic_area"}:
                    return coord
        return None


def normalize_location_key(text: str) -> str:
    return re.sub(r"[\s（）()？?《》“”\"'：:；;，,、/|—\-]+", "", str(text or ""))


def parse_coord(raw: str) -> tuple[float, float] | None:
    nums = re.findall(r"\d+(?:\.\d+)?", str(raw))
    if len(nums) < 2:
        return None
    lng = float(nums[0])
    lat = float(nums[1])
    return lng, lat


def read_cultural_places(catalog: LocationCatalog) -> list[dict[str, Any]]:
    path = DATA_DIR / "文化景观经纬度.xlsx"
    df = pd.read_excel(path).where(pd.notnull, None)
    rows: list[dict[str, Any]] = []
    for index, row in df.iterrows():
        name = str(row["文化景观名称"]).strip()
        parsed = parse_coord(str(row["经纬度"]))
        if not parsed:
            continue
        lng, lat = parsed
        region_id, region = region_for(lng, lat, name)
        address = ADDRESS_HINTS.get(name)
        kind = place_kind_for(name)
        place_type = "heritage"
        if "万家岭" in name or "炮台" in name:
            kind = "battle_memory_site"
        item = {
            "id": "pl-" + slugify(name),
            "name": name,
            "slug": slugify(name),
            "place_type": place_type,
            "place_kind": kind,
            "longitude": lng,
            "latitude": lat,
            "altitude": ALTITUDE_HINTS.get(name),
            "spatial_precision": "exact",
            "coordinate_confidence": "high",
            "region_id": region_id,
            "region": region,
            "address_raw": address,
            "start_year": 1937,
            "end_year": 1945,
            "highlight_level": 3 if any(token in name for token in ["纪念", "美庐", "周恩来", "万家岭", "东南分局"]) else 2,
            "base_info": address or region,
            "summary": SUMMARY_HINTS.get(name, f"{name}来自文化景观经纬度表，是平台常态展示的文化景观坐标点。"),
            "tags": sorted(set(["文化景观", *TAG_HINTS.get(name, [])])),
            "source_row": index,
        }
        rows.append(item)
        catalog.add(
            name,
            lng,
            lat,
            "exact",
            "high",
            "文化景观经纬度.xlsx",
            aliases=ALIASES.get(name, []),
        )
    return rows


ADDRESS_HINTS = {
    "美庐别墅": "庐山牯岭东谷河西路180号",
    "周恩来纪念馆河西路442号别墅": "庐山牯岭东谷河西路442号",
    "庐山抗战纪念馆以及“必恭敬止”石刻": "庐山牯岭东谷，原庐山图书馆相关区域",
    "庐山抗战纪念馆及“必恭敬止”石刻": "庐山牯岭东谷，原庐山图书馆相关区域",
    "庐山大厦": "庐山牯岭东谷，原庐山传习学舍",
    "万家岭大捷纪念园": "德安县河东乡上畈村万家岭一带",
    "德安县博物馆": "德安县城，万家岭战役地方史料承接点",
    "中共中央东南分局旧址": "南昌市西湖区东书院街21号",
    "庐山抗日救亡将士纪念碑": "庐山牯岭小天池景区",
}

ALTITUDE_HINTS = {
    "月照松林": 1060,
    "河山不二入口": 1085,
    "庐山抗日救亡将士纪念碑": 1092,
    "庐山大厦": 1025,
    "庐山抗战纪念馆以及“必恭敬止”石刻": 1028,
    "庐山抗战纪念馆及“必恭敬止”石刻": 1028,
    "周恩来纪念馆河西路442号别墅": 1045,
    "美庐别墅": 1042,
    "庐山大天池炮台": 1160,
}

SUMMARY_HINTS = {
    "美庐别墅": "美庐别墅位于庐山牯岭东谷河西路180号，是庐山近代别墅群的重要建筑，也是战时政治活动和庐山文化景观叙事的关键节点。",
    "周恩来纪念馆河西路442号别墅": "河西路442号别墅位于庐山牯岭东谷河西路442号，后辟为周恩来在庐山活动纪念室，可承接国共合作与庐山谈判记忆。",
    "庐山抗战纪念馆以及“必恭敬止”石刻": "庐山抗战纪念馆所在区域与原庐山图书馆和战时题刻相关，是庐山抗战史料展示和现场解读的重要文化景观。",
    "庐山抗日救亡将士纪念碑": "庐山抗战阵亡将士纪念碑位于牯岭小天池景区，关联第九十九军阵亡将士纪念与战后重建记忆。",
    "万家岭大捷纪念园": "万家岭大捷纪念园位于德安县河东乡上畈村万家岭一带，是武汉会战赣北战场记忆的重要展示空间。",
    "中共中央东南分局旧址": "中共中央东南分局旧址位于南昌市西湖区东书院街21号，是抗战初期东南地区党的工作机构旧址。",
}

TAG_HINTS = {
    "美庐别墅": ["近代别墅", "河西路", "政治空间"],
    "周恩来纪念馆河西路442号别墅": ["周恩来", "河西路", "国共合作"],
    "庐山大天池炮台": ["炮台", "大天池", "防御"],
    "万家岭大捷纪念园": ["万家岭", "武汉会战", "德安"],
    "中共中央东南分局旧址": ["南昌", "东南分局", "新四军"],
}

ALIASES = {
    "庐山抗战纪念馆以及“必恭敬止”石刻": ["庐山抗战纪念馆", "原庐山图书馆", "庐山图书馆", "必恭敬止", "庐山抗战博物馆"],
    "庐山抗日救亡将士纪念碑": ["庐山抗战阵亡将士纪念碑", "庐山抗战纪念碑", "小天池纪念碑"],
    "周恩来纪念馆河西路442号别墅": ["河西路442号别墅", "周恩来纪念室", "周恩来纪念馆"],
    "美庐别墅": ["美庐", "河西路180号"],
    "庐山大天池炮台": ["大天池", "大天池炮台"],
    "万家岭大捷纪念园": ["万家岭", "上畈村", "万家岭战役"],
    "中共中央东南分局旧址": ["东南分局旧址", "东书院街21号"],
}


def place_kind_for(name: str) -> str:
    if "别墅" in name:
        return "villa"
    if "纪念" in name or "塔" in name:
        return "memorial"
    if "博物馆" in name:
        return "museum"
    if "旧址" in name:
        return "historic_site"
    if "炮台" in name:
        return "military_site"
    if "入口" in name:
        return "landscape_entrance"
    return "heritage_landscape"


def seed_manual_catalog(catalog: LocationCatalog) -> None:
    manual = [
        ("牯岭东谷会议区", 115.971353, 29.561571, "site", "medium", "由庐山抗战纪念馆/原庐山图书馆坐标推定", ["庐山图书馆", "庐山会议旧址", "谈判地庐山图书馆", "火莲院"]),
        ("陈诚别墅", 115.978519, 29.566942, "road", "low", "庐山牯岭东谷别墅区代理点，需继续核验", ["住陈诚别墅"]),
        ("仙岩旅社", 115.9766013, 29.571633, "site", "low", "牯岭核心区代理点，需继续核验", ["仙岩旅社"]),
        ("牯岭镇", 115.9766013, 29.571633, "village", "medium", "现存地名锚点", ["牯岭", "江西庐山牯岭", "庐山牯岭"]),
        ("庐山管理局旧址", 115.9766013, 29.571633, "site", "low", "牯岭核心区代理点，需进一步核验", ["庐山管理局", "原管理局旧址", "管理局旧址"]),
        ("河东路", 115.9791067, 29.5677684, "road", "high", "现存道路锚点", ["河东路35号", "河东路三十五号", "河东路32号", "柏树路124号", "俄罗斯亚细亚银行"]),
        ("河西路", 115.9731582, 29.5620179, "road", "high", "现存道路锚点", ["河西路41号", "河西路44号"]),
        ("大林路", 115.9718762, 29.5699774, "road", "high", "现存道路锚点", ["牯岭大林路"]),
        ("莲谷路", 115.9829731, 29.5713378, "road", "high", "现存道路锚点", ["莲谷路分驻所"]),
        ("小天池", 115.985582, 29.579013, "site", "high", "文化景观点坐标", ["庐山小天池", "小天池景区"]),
        ("土坝岭", 115.9766, 29.5768, "site", "low", "庐山牯岭北侧战时地名代理点，需旧图校核", ["庐山土坝岭"]),
        ("大天池", 115.954304, 29.562742, "site", "high", "文化景观点坐标", ["大天池炮台"]),
        ("五老峰", 116.0178454, 29.5516815, "scenic_area", "high", "现存地名锚点", []),
        ("三叠泉", 116.0366, 29.5483, "scenic_area", "medium", "现存景区锚点", ["三叠泉阵地"]),
        ("海会镇", 116.0541354, 29.541631, "village", "high", "现存行政地名锚点", ["海会", "土楼镇", "海会（土楼）镇"]),
        ("高垅陈村", 116.0541354, 29.541631, "village", "medium", "以海会镇为村镇级代理点", ["高垄陈村", "高陇", "高垅", "高垅汪家涧"]),
        ("星子县城", 116.0396561, 29.4505923, "village", "high", "以今庐山市城区为旧星子县城锚点", ["星子县城", "星子", "庐山市旧星子县城"]),
        ("马当镇", 116.6548812, 29.9926306, "village", "medium", "以马当镇作为马当要塞/炮台叙事锚点", ["马当要塞", "马当炮台遗址", "彭泽县马当镇"]),
        ("马回岭", 115.8072556, 29.4618986, "village", "high", "现存地名锚点", ["德安以北马回岭"]),
        ("岷山金盘村", 115.7400, 29.5400, "village", "low", "柴桑区岷山乡金盘村代理点，需实测校核", ["岷山", "金盘村", "柴桑区岷山乡金盘村"]),
        ("仰天坪", 115.9544036, 29.5359087, "site", "high", "现存地名锚点", []),
        ("汉阳峰", 115.9553713, 29.5009084, "scenic_area", "high", "现存地名锚点", []),
        ("好汉坡", 115.9698, 29.5532, "scenic_area", "low", "登山路径代理点，需继续核验", []),
        ("东林寺", 115.9026, 29.6422, "site", "medium", "现存寺院锚点", ["东林村", "东林街", "九莲公路和尚坟"]),
        ("报国寺", 115.9600, 29.5460, "site", "low", "历史地名代理点，需继续核验", []),
        ("南浔线蓝桥上段", 115.9700, 29.4700, "road", "low", "南浔铁路/公路代理点，需旧图校核", ["南浔路蓝桥上段", "南浔线", "南浔路"]),
        ("王家坡", 115.9730, 29.5790, "site", "low", "庐山北侧战时地名代理点，需继续核验", []),
        ("碧龙潭", 115.9820, 29.5790, "scenic_area", "low", "庐山北侧沟谷代理点，需继续核验", []),
        ("碧云庵", 115.9580, 29.5480, "site", "low", "突围路线代理点，需继续核验", []),
        ("张家山", 115.9800, 29.5460, "site", "low", "战时地名代理点，需继续核验", []),
        ("太乙村", 116.0000, 29.5250, "village", "low", "庐山太乙村代理点，需继续核验", []),
        ("女儿城", 115.9840, 29.5750, "site", "low", "牯岭周边地名代理点，需继续核验", []),
        ("大月山", 115.9710, 29.5720, "scenic_area", "medium", "牯岭东谷背山地形锚点", []),
        ("月照松林", 115.973092, 29.566782, "exact", "high", "文化景观点坐标", []),
        ("金轮峰", 115.9500, 29.5500, "scenic_area", "low", "庐山西南山地代理点，需旧图校核", []),
        ("一文字山", 115.9640, 29.5360, "scenic_area", "low", "庐山南缘通道代理点，需旧图校核", []),
        ("海参山", 115.9640, 29.5360, "scenic_area", "low", "庐山南缘通道代理点，需旧图校核", []),
        ("三角山", 115.9500, 29.5500, "scenic_area", "low", "庐山西南山地代理点，需旧图校核", []),
        ("青山", 115.9640, 29.5360, "scenic_area", "low", "庐山南缘通道代理点，需旧图校核", []),
        ("鞋山", 116.1030, 29.5150, "scenic_area", "medium", "鄱阳湖鞋山附近锚点", ["姑塘", "姑塘（鞋山附近）", "鄱阳湖鞋山"]),
        ("元帝宫", 116.0200, 29.4800, "site", "low", "庐山山麓历史地名代理点，需继续核验", []),
        ("玉筋山", 116.0200, 29.4800, "scenic_area", "low", "原文又作王筋山，暂以庐山山麓代理点表示", ["王筋山"]),
        ("观音桥", 116.0060, 29.5160, "site", "medium", "庐山观音桥景区锚点", []),
        ("神灵湖", 116.1290, 29.3910, "village", "low", "星子/都昌转移线路代理点，需继续核验", []),
        ("金桥村孔家山", 115.9280, 29.4710, "village", "low", "金桥村孔家山代理点，需继续核验", ["金桥村", "孔家山"]),
        ("都昌陈浪", 116.2800, 29.4200, "village", "low", "都昌县陈浪代理点，需继续核验", ["陈浪"]),
        ("杨家山", 116.3200, 29.3800, "village", "low", "流亡政府路线代理点，需继续核验", []),
        ("南昌东书院街21号", 115.892255, 28.668917, "exact", "high", "文化景观点坐标", ["南昌", "东南分局"]),
    ]
    for row in manual:
        catalog.add(*row)


WAR_KEYWORDS = [
    "日军", "敌机", "国军", "守军", "游击", "师团", "联队", "中队", "大队",
    "进攻", "攻击", "占领", "攻占", "沦陷", "轰炸", "炮击", "战斗", "激战",
    "击毙", "击伤", "伤亡", "包围", "阻击", "登陆", "毒气", "瓦斯", "阵地",
    "突围", "扫荡", "屠杀", "破坏", "伏击", "撤退", "受降", "防御", "战役",
    "失守", "要塞",
]

AFFAIRS_KEYWORDS = [
    "谈判", "谈话会", "会议", "救济", "侨民", "管理局", "维持会", "公署",
    "成立", "迁入", "接管", "恢复", "纪念碑", "题刻", "学校", "医院", "训练班",
]


def classify(text: str) -> tuple[str, str, str, str | None, str]:
    clean = text or ""
    is_war = any(k in clean for k in WAR_KEYWORDS)
    is_affairs = any(k in clean for k in AFFAIRS_KEYWORDS)
    domain = "war" if is_war else "affairs"
    if not is_war and is_affairs:
        domain = "affairs"

    subtype = "historical"
    if domain == "war":
        if any(k in clean for k in ["轰炸", "敌机", "投弹"]):
            subtype = "bombing"
        elif any(k in clean for k in ["占领", "攻占", "沦陷", "受降"]):
            subtype = "occupation"
        elif "登陆" in clean:
            subtype = "landing"
        elif any(k in clean for k in ["屠杀", "扫荡", "报复"]):
            subtype = "massacre"
        elif any(k in clean for k in ["伏击", "袭击", "破坏"]):
            subtype = "guerrilla"
        elif any(k in clean for k in ["阵地", "防御", "工事", "炮台"]):
            subtype = "fortification"
        elif any(k in clean for k in ["撤退", "突围", "转移", "运送", "给养"]):
            subtype = "military_movement"
        else:
            subtype = "attack"
    else:
        if any(k in clean for k in ["谈判", "谈话", "宣言"]):
            subtype = "political_talk"
        elif any(k in clean for k in ["救济", "侨民", "医院", "快乐家", "保育"]):
            subtype = "relief"
        elif any(k in clean for k in ["管理局", "维持会", "公署", "接管", "恢复"]):
            subtype = "administration"
        elif any(k in clean for k in ["纪念", "题刻", "公墓", "碑"]):
            subtype = "memorial"
        elif any(k in clean for k in ["学校", "训练班", "会议"]):
            subtype = "education_culture"
        else:
            subtype = "civil_affairs"

    japanese = any(k in clean for k in ["日军", "敌机", "日本", "师团", "联队", "中队", "日伪", "伪"])
    chinese = any(k in clean for k in ["国军", "守军", "游击", "中共", "新四军", "管理局", "蒋", "杨遇春", "熊式辉", "薛岳", "庐山警察"])
    chinese = chinese or any(k in clean for k in [
        "周恩来", "宋庆龄", "邓颖超", "项英", "陈毅", "胡家", "保安团",
        "江西省政府", "九江司令部", "团管区", "司令部", "庐山管理局",
    ])
    foreign_civil = any(k in clean for k in [
        "侨民", "外侨", "美侨", "英侨", "美国", "英国", "英美",
        "瑞士", "教士", "妇女", "儿童", "医院", "学校",
    ])
    collaborationist = "伪" in clean or "汉奸" in clean

    initiator: str | None = None
    if any(k in clean for k in ["日军进攻", "日军占领", "日军攻", "敌机轰炸", "日军轰炸", "日伪军报复", "日军扫荡", "要塞失守"]):
        initiator = "japanese_army"
    elif any(k in clean for k in ["国军发动", "守军袭击", "游击队", "新四军", "破坏", "伏击", "击退"]):
        initiator = "chinese_forces"

    if collaborationist and not japanese and not chinese:
        actor = "collaborationist"
    elif initiator:
        actor = initiator
    elif japanese and chinese:
        actor = "mixed"
    elif japanese:
        actor = "japanese_army"
    elif chinese:
        actor = "chinese_forces"
    elif foreign_civil:
        actor = "civilian_foreign"
    else:
        actor = "mixed"

    note = "按关键词、动作发起方与原文主语自动初分；mixed 仅用于多方同场或主次难判记录。"
    return domain, subtype, actor, initiator, note


def parse_time(raw: str, current_year: int | None) -> tuple[str, str, str, int, int | None, int | None] | None:
    text = str(raw or "").strip()
    text = text.replace("—", "-").replace("－", "-").replace("至", "-")
    if not text or text in {"日期不详", "现存", "现存遗址"}:
        return None
    if re.fullmatch(r"\d{4}年", text):
        year = int(text[:4])
        return f"{year}-01-01", f"{year}-12-31", "year", year, None, None
    if m := re.fullmatch(r"(\d{4})", text):
        year = int(m.group(1))
        return f"{year}-01-01", f"{year}-12-31", "year", year, None, None
    if m := re.match(r"(\d{4})(\d{2})(\d{2})", text):
        year, month, day = map(int, m.groups())
        return f"{year:04d}-{month:02d}-{day:02d}", f"{year:04d}-{month:02d}-{day:02d}", "day", year, month, day
    if m := re.match(r"(\d{4})(\d{2})(?!\d)", text):
        year, month = map(int, m.groups())
        last = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last:02d}", "month", year, month, None
    if m := re.match(r"(\d{4})(\d{2})[-/](\d{2})", text):
        year, m1, m2 = map(int, m.groups())
        last = calendar.monthrange(year, m2)[1]
        return f"{year:04d}-{m1:02d}-01", f"{year:04d}-{m2:02d}-{last:02d}", "range", year, m1, None
    if m := re.match(r"(\d{4})年([春夏秋冬])", text):
        year = int(m.group(1))
        season = m.group(2)
        ranges = {"春": (3, 1, 5, 31), "夏": (6, 1, 8, 31), "秋": (9, 1, 11, 30), "冬": (12, 1, 12, 31)}
        m1, d1, m2, d2 = ranges[season]
        return f"{year:04d}-{m1:02d}-{d1:02d}", f"{year:04d}-{m2:02d}-{d2:02d}", "season", year, m1, None

    year = current_year
    if year is None:
        return None

    if "月底" in text or "中旬" in text or "下旬" in text:
        nums = [int(n) for n in re.findall(r"\d{1,2}", text)]
        if nums:
            start_month = nums[0]
            end_month = nums[-1]
            start_day = 20 if "底" in text else 1
            end_day = 25 if "中下旬" in text else calendar.monthrange(year, end_month)[1]
            return f"{year:04d}-{start_month:02d}-{start_day:02d}", f"{year:04d}-{end_month:02d}-{end_day:02d}", "season", year, start_month, None

    if m := re.match(r"(\d{1,2})月[-到至](\d{1,2})月", text):
        m1, m2 = map(int, m.groups())
        last = calendar.monthrange(year, m2)[1]
        return f"{year:04d}-{m1:02d}-01", f"{year:04d}-{m2:02d}-{last:02d}", "range", year, m1, None
    if m := re.match(r"(\d{1,2})月", text):
        month = int(m.group(1))
        last = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last:02d}", "month", year, month, None
    if m := re.match(r"农历(\S+)月", text):
        return f"{year:04d}-08-01", f"{year:04d}-08-31", "month", year, 8, None
    if m := re.match(r"([春夏秋冬])", text):
        ranges = {"春": (3, 1, 5, 31), "夏": (6, 1, 8, 31), "秋": (9, 1, 11, 30), "冬": (12, 1, 12, 31)}
        m1, d1, m2, d2 = ranges[m.group(1)]
        return f"{year:04d}-{m1:02d}-{d1:02d}", f"{year:04d}-{m2:02d}-{d2:02d}", "season", year, m1, None

    if m := re.match(r"(\d{1,2})\.(\d{1,2})[-/](\d{1,2})\.(\d{1,2})", text):
        m1, d1, m2, d2 = map(int, m.groups())
        return f"{year:04d}-{m1:02d}-{d1:02d}", f"{year:04d}-{m2:02d}-{d2:02d}", "range", year, m1, d1
    if m := re.match(r"(\d{1,2})\.(\d{1,2})[-/](\d{1,2})", text):
        month, d1, d2 = map(int, m.groups())
        return f"{year:04d}-{month:02d}-{d1:02d}", f"{year:04d}-{month:02d}-{d2:02d}", "range", year, month, d1
    if m := re.match(r"(\d{1,2})\.(\d{1,2})", text):
        month, day = map(int, m.groups())
        return f"{year:04d}-{month:02d}-{day:02d}", f"{year:04d}-{month:02d}-{day:02d}", "day", year, month, day
    if m := re.match(r"(\d{1,2})月底", text):
        month = int(m.group(1))
        last = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-20", f"{year:04d}-{month:02d}-{last:02d}", "season", year, month, None
    return None


def clean_cell(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").replace("\u200b", "")).strip()


def short_title(text: str) -> str:
    text = re.sub(r"[①-⑳⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", "", clean_cell(text))
    text = re.sub(r"。.*$", "", text)
    return text[:80] or "未命名事件"


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


class SeedBuilder:
    def __init__(self) -> None:
        self.raw_records: list[dict[str, Any]] = []
        self.sources: dict[str, dict[str, Any]] = {}
        self.places: dict[str, dict[str, Any]] = {}
        self.events: dict[str, dict[str, Any]] = {}
        self.event_locations: list[dict[str, Any]] = []
        self.timeline: dict[str, dict[str, Any]] = {}
        self.timeline_links: list[dict[str, Any]] = []
        self.persons: dict[str, dict[str, Any]] = {}
        self.event_persons: list[dict[str, Any]] = []
        self.source_links: list[dict[str, Any]] = []
        self.geo_evidence: list[dict[str, Any]] = []
        self.media: dict[str, dict[str, Any]] = {}
        self.media_links: list[dict[str, Any]] = []

    def add_source(self, sid: str, title: str, source_type: str, citation: str, **extra: Any) -> None:
        self.sources[sid] = {
            "id": sid,
            "title": title,
            "source_type": source_type,
            "citation": citation,
            "url": extra.get("url"),
            "reliability": extra.get("reliability", "reviewed"),
            "note": extra.get("note"),
            "metadata": extra.get("metadata", {}),
        }

    def add_raw(self, source_file: str, source_type: str, row_key: str, payload: Any, sheet: str | None, row_index: int | None) -> str:
        rid = stable_id("raw", f"{source_file}:{row_key}")
        self.raw_records.append({
            "id": rid,
            "batch_key": BATCH_KEY,
            "source_file": source_file,
            "source_type": source_type,
            "sheet_name": sheet,
            "row_index": row_index,
            "row_key": row_key,
            "payload": payload,
            "payload_hash": payload_hash(payload),
        })
        return rid

    def add_place(self, place: dict[str, Any], source_id: str) -> None:
        pid = place["id"]
        if pid in self.places:
            return
        self.places[pid] = place
        self.source_links.append({
            "source_id": source_id,
            "target_type": "place",
            "target_id": pid,
            "relation_type": "evidence",
            "note": "地点坐标和基础信息来源",
        })
        self.geo_evidence.append({
            "target_type": "place",
            "target_id": pid,
            "location_label": place["name"],
            "longitude": place["longitude"],
            "latitude": place["latitude"],
            "precision_level": place["spatial_precision"],
            "confidence": place["coordinate_confidence"],
            "evidence_type": "source_table",
            "evidence_title": source_id,
            "note": place.get("address_raw"),
        })

    def add_event(self, event: dict[str, Any], loc: Coord, raw_id: str, source_id: str, people_text: str = "") -> str:
        # Merge obvious same-day / same-place duplicates.
        for existing_id, existing in self.events.items():
            if existing["start_date"] == event["start_date"]:
                same_place = any(el["event_id"] == existing_id and el["location_name"] == loc.label for el in self.event_locations)
                if same_place and similarity(existing["title"], event["title"]) > 0.58:
                    self.source_links.append({
                        "source_id": source_id,
                        "target_type": "event",
                        "target_id": existing_id,
                        "relation_type": "supporting_record",
                        "note": f"合并自原始记录 {raw_id}",
                    })
                    return existing_id
        eid = event["id"]
        self.events[eid] = event
        elid = stable_id("el", f"{eid}:{loc.label}")
        self.event_locations.append({
            "id": elid,
            "event_id": eid,
            "location_name": loc.label,
            "address_raw": loc.note,
            "longitude": loc.lng,
            "latitude": loc.lat,
            "spatial_precision": loc.precision,
            "coordinate_confidence": loc.confidence,
            "source_note": loc.note,
        })
        self.source_links.append({
            "source_id": source_id,
            "target_type": "event",
            "target_id": eid,
            "relation_type": "evidence",
            "note": f"原始记录 {raw_id}",
        })
        self.source_links.append({
            "source_id": source_id,
            "target_type": "raw_import",
            "target_id": raw_id,
            "relation_type": "raw_row",
            "note": f"生成事件 {eid}",
        })
        self.geo_evidence.append({
            "target_type": "event_location",
            "target_id": elid,
            "location_label": loc.label,
            "longitude": loc.lng,
            "latitude": loc.lat,
            "precision_level": loc.precision,
            "confidence": loc.confidence,
            "evidence_type": "manual_inference" if loc.confidence == "low" else "legacy_annotation",
            "evidence_title": source_id,
            "note": loc.note,
        })
        self.add_people(eid, people_text)
        return eid

    def add_people(self, event_id: str, people_text: str) -> None:
        if not people_text:
            return
        for name in re.split(r"[、，,；;\s/及和]+", people_text):
            name = name.strip("（）() ")
            if not name or len(name) < 2 or len(name) > 8:
                continue
            if any(k in name for k in ["司令部", "部队", "师团", "联队", "中队", "大队", "学校", "政府", "管理局", "委员会", "团"]):
                continue
            pid = stable_id("person", name)
            if pid not in self.persons:
                self.persons[pid] = {
                    "id": pid,
                    "name": name,
                    "aliases": [],
                    "summary": f"{name}在原始档案中被提及，需进一步补充身份与生平说明。",
                    "tags": ["原始档案提及"],
                }
            role = "mentioned"
            pair = {"event_id": event_id, "person_id": pid, "role": role, "note": "由原始人物字段抽取"}
            if pair not in self.event_persons:
                self.event_persons.append(pair)

    def add_timeline(self, item: dict[str, Any], event_id: str | None = None) -> None:
        key = item["time_key"]
        if key not in self.timeline:
            self.timeline[key] = item
        if event_id:
            link = {"time_key": key, "event_id": event_id, "relation_type": "mentions"}
            if link not in self.timeline_links:
                self.timeline_links.append(link)


def build_from_docx(builder: SeedBuilder, catalog: LocationCatalog) -> None:
    path = DATA_DIR / "庐山抗战历史事件表（批注地点坐标）.docx"
    doc = Document(path)
    table = doc.tables[0]
    current_year: int | None = None
    chapter_no = 0
    chapter_title = ""
    in_sites = False
    source_id = "src-timeline-docx"

    for index, row in enumerate(table.rows):
        cells = [clean_cell(cell.text) for cell in row.cells]
        if not any(cells):
            continue
        raw_id = builder.add_raw(path.name, "docx", f"row-{index}", {"cells": cells}, None, index)
        if index == 0:
            continue
        if cells.count(cells[0]) == len(cells) and "幕" in cells[0]:
            chapter_no += 1
            chapter_title = cells[0]
            continue
        if cells.count(cells[0]) == len(cells) and re.fullmatch(r"\d{4}年", cells[0]):
            current_year = int(cells[0][:4])
            continue
        if cells.count(cells[0]) == len(cells) and cells[0] == "现存遗址":
            in_sites = True
            continue
        if in_sites and cells[0] == "现存":
            name = cells[1]
            loc_text = cells[2] or cells[1]
            loc = catalog.find(name + " " + loc_text)
            if loc:
                lng, lat = loc.lng, loc.lat
                region_id, region = region_for(lng, lat, name + loc_text)
                place = {
                    "id": "pl-" + slugify(name),
                    "name": name,
                    "slug": slugify(name),
                    "place_type": "heritage",
                    "place_kind": place_kind_for(name),
                    "longitude": lng,
                    "latitude": lat,
                    "altitude": None,
                    "spatial_precision": loc.precision,
                    "coordinate_confidence": loc.confidence,
                    "region_id": region_id,
                    "region": region,
                    "address_raw": loc_text,
                    "start_year": 1937,
                    "end_year": 1945,
                    "highlight_level": 2,
                    "base_info": loc_text,
                    "summary": f"{name}见于时间线表的现存遗址清单，坐标按 {loc.label} 锚点入库，后续可补充文保资料和现场图片。",
                    "tags": ["现存遗址", "文化景观"],
                }
                builder.add_place(place, source_id)
            continue

        time_raw = cells[0]
        parsed = parse_time(time_raw, current_year)
        if not parsed:
            continue
        start_date, end_date, precision, year, month, day = parsed
        background = cells[1]
        local_text = cells[2]
        place_text = cells[3]
        text = local_text or background
        if not text:
            continue
        scope = "lushan" if local_text else "national"
        title = short_title(text)
        time_key = f"{start_date.replace('-', '')}-{index:03d}"
        narration = text if not background or background == text else f"{text} 全国/区域背景：{background}"
        timeline_item = {
            "time_key": time_key,
            "start_date": start_date,
            "end_date": end_date,
            "date_precision": precision,
            "sort_order": index,
            "chapter_no": chapter_no or None,
            "chapter_title": chapter_title or None,
            "title": title,
            "narration": narration,
            "scope": scope if scope != "national" else "national",
            "map_focus": {},
            "source_context": f"{path.name} row {index}",
        }
        event_id: str | None = None
        loc = catalog.find((place_text or "") + " " + text)
        if loc and (local_text or place_text):
            domain, subtype, actor, initiator, note = classify(text + " " + place_text)
            region_id, region = region_for(loc.lng, loc.lat, loc.label)
            eid = stable_id("ev", f"docx:{start_date}:{title}:{loc.label}")
            event = {
                "id": eid,
                "title": title,
                "slug": eid,
                "event_domain": domain,
                "event_subtype": subtype,
                "actor_side": actor,
                "initiator_side": initiator,
                "start_time_raw": time_raw,
                "end_time_raw": None if start_date == end_date else time_raw,
                "normalized_start": start_date,
                "normalized_end": end_date,
                "start_date": start_date,
                "end_date": end_date,
                "date_precision": precision,
                "year": year,
                "month": month,
                "day": day,
                "summary": title,
                "description": text,
                "narrative": narration,
                "classification_note": note,
                "region": region,
                "region_id": region_id,
                "place_id": None,
                "importance": 3 if domain == "war" else 2,
                "source_confidence": "raw_import",
                "tags": [domain, subtype, actor],
            }
            event_id = builder.add_event(event, loc, raw_id, source_id, text)
        builder.add_timeline(timeline_item, event_id)


def build_from_archive_xlsx(builder: SeedBuilder, catalog: LocationCatalog) -> None:
    path = DATA_DIR / "庐山历史归档_Table1_Default View.xlsx"
    df = pd.read_excel(path).where(pd.notnull, None)
    source_id = "src-history-archive-xlsx"
    current_year = 1938
    for index, row in df.iterrows():
        payload = {str(k): (None if pd.isna(v) else v) for k, v in row.items()}
        raw_id = builder.add_raw(path.name, "xlsx", f"row-{index}", payload, "Table1_Default View", int(index))
        title = clean_cell(payload.get("档案内容简介") or "")
        if not title:
            continue
        time_raw = clean_cell(payload.get("涉及时间（19380520）") or "")
        parsed = parse_time(time_raw, current_year)
        if parsed is None:
            parsed = parse_time("1938", current_year)
        if parsed is None:
            continue
        start_date, end_date, precision, year, month, day = parsed
        place_text = clean_cell(payload.get("涉及地点") or "")
        loc = catalog.find(place_text + " " + title)
        if not loc:
            continue
        domain, subtype, actor, initiator, note = classify(title + " " + place_text)
        region_id, region = region_for(loc.lng, loc.lat, loc.label)
        eid = stable_id("ev", f"xlsx:{start_date}:{title}:{loc.label}")
        event = {
            "id": eid,
            "title": short_title(title),
            "slug": eid,
            "event_domain": domain,
            "event_subtype": subtype,
            "actor_side": actor,
            "initiator_side": initiator,
            "start_time_raw": time_raw,
            "end_time_raw": None if start_date == end_date else time_raw,
            "normalized_start": start_date,
            "normalized_end": end_date,
            "start_date": start_date,
            "end_date": end_date,
            "date_precision": precision,
            "year": year,
            "month": month,
            "day": day,
            "summary": short_title(title),
            "description": title,
            "narrative": title,
            "classification_note": note,
            "region": region,
            "region_id": region_id,
            "place_id": None,
            "importance": 3 if domain == "war" else 2,
            "source_confidence": "raw_import",
            "tags": [domain, subtype, actor, "archive_xlsx"],
        }
        builder.add_event(event, loc, raw_id, source_id, clean_cell(payload.get("涉及人物") or ""))


def make_media(builder: SeedBuilder) -> None:
    asset_map = {
        "pl-yuezhao-songlin": "/assets/places/ai-yuezhao-songlin.png",
        "pl-heshan-buer-entrance": "/assets/places/ai-heshan-buer-entrance.png",
        "pl-zhou-enlai-villa-hexilu-442": "/assets/places/ai-zhou-villa.png",
        "pl-lushan-datianchi-fort": "/assets/places/ai-datianchi-fort.png",
        "pl-dean-museum": "/assets/places/ai-dean-museum.png",
    }
    fallback = "/assets/places/ai-datianchi-fort.png"
    for pid, place in builder.places.items():
        mid = stable_id("media", pid)
        url = asset_map.get(pid, fallback)
        is_ai = url.startswith("/assets/places/ai-")
        builder.media[mid] = {
            "id": mid,
            "media_type": "ai_restoration" if is_ai else "image",
            "url": url,
            "title": f"{place['name']} 图像",
            "caption": "平台现有图像资源；若为 AI 兜底图，正式发布前应补充现场照片或授权图。",
            "is_ai_generated": is_ai,
            "source_id": "src-project-assets",
        }
        builder.media_links.append({
            "media_id": mid,
            "target_type": "place",
            "target_id": pid,
            "relation_type": "primary_image",
            "sort_order": 0,
            "note": "常态展示点图片",
        })
        place["primary_media_id"] = mid


def emit_sql(builder: SeedBuilder, output: Path) -> None:
    lines: list[str] = [
        "-- Generated by scripts/seed_lushan_platform.py",
        "BEGIN;",
        "TRUNCATE TABLE public.download_records, public.export_requests, public.ugc_submissions, public.favorites, public.timeline_event_links, public.timeline_keyframes, public.timeline_entries, public.geo_evidence, public.source_links, public.media_links, public.event_persons, public.persons, public.place_events, public.event_locations, public.events, public.place_relations, public.media, public.places, public.sources, public.sessions, public.admins, public.users, public.notifications, public.admin_logs, public.system_configs, public.dataset_versions, public.raw_import_records RESTART IDENTITY CASCADE;",
    ]

    for item in builder.raw_records:
        lines.append(
            "INSERT INTO public.raw_import_records (id,batch_key,source_file,source_type,sheet_name,row_index,row_key,payload,payload_hash) VALUES "
            f"({q(item['id'])},{q(item['batch_key'])},{q(item['source_file'])},{q(item['source_type'])},{q(item['sheet_name'])},{q(item['row_index'])},{q(item['row_key'])},{qjson(item['payload'])}::jsonb,{q(item['payload_hash'])});"
        )

    for item in builder.sources.values():
        lines.append(
            "INSERT INTO public.sources (id,title,source_type,citation,url,reliability,note,metadata) VALUES "
            f"({q(item['id'])},{q(item['title'])},{q(item['source_type'])},{q(item['citation'])},{q(item.get('url'))},{q(item['reliability'])},{q(item.get('note'))},{qjson(item.get('metadata', {}))});"
        )

    lines.extend([
        "INSERT INTO public.users (id,email,username,nickname,password_hash,role,status,favorites,settings) VALUES ('user-viewer','viewer@example.com','viewer','档案共建者','shanjian123','user','active','[]','{}');",
        "INSERT INTO public.admins (id,email,nickname,password_hash,role,status,permissions) VALUES ('admin-seed','admin@shanjian.local','系统管理员','shanjian123','admin','active','[\"*\"]');",
    ])

    for p in builder.places.values():
        lines.append(
            "INSERT INTO public.places (id,name,slug,official_name,historical_names,place_type,place_kind,longitude,latitude,altitude,geom,spatial_precision,coordinate_confidence,region_id,region,address_raw,start_year,end_year,highlight_level,base_info,summary,narrative,source_confidence,tags,metadata,status,review_status,primary_media_id) VALUES "
            f"({q(p['id'])},{q(p['name'])},{q(p['slug'])},NULL,'[]',{q(p['place_type'])},{q(p['place_kind'])},{q(p['longitude'])},{q(p['latitude'])},{q(p.get('altitude'))},{q(json.dumps({'type':'Point','coordinates':[p['longitude'],p['latitude']]}, ensure_ascii=False))},{q(p['spatial_precision'])},{q(p['coordinate_confidence'])},{q(p['region_id'])},{q(p['region'])},{q(p.get('address_raw'))},{q(p['start_year'])},{q(p['end_year'])},{q(p['highlight_level'])},{q(p['base_info'])},{q(p['summary'])},NULL,{q(p['coordinate_confidence'])},{qjson(p['tags'])},{qjson({'source': 'seed_lushan_platform.py'})},'active','approved',{q(p.get('primary_media_id'))});"
        )

    for e in builder.events.values():
        lines.append(
            "INSERT INTO public.events (id,title,slug,event_type,event_domain,event_subtype,actor_side,initiator_side,start_time_raw,end_time_raw,normalized_start,normalized_end,start_date,end_date,date_precision,year,month,day,summary,description,narrative,classification_note,region,region_id,place_id,importance,source_confidence,tags,status) VALUES "
            f"({q(e['id'])},{q(e['title'])},{q(e['slug'])},'historical',{q(e['event_domain'])},{q(e['event_subtype'])},{q(e['actor_side'])},{q(e.get('initiator_side'))},{q(e['start_time_raw'])},{q(e.get('end_time_raw'))},{q(e['normalized_start'])},{q(e.get('normalized_end'))},{q(e['start_date'])},{q(e['end_date'])},{q(e['date_precision'])},{q(e['year'])},{q(e.get('month'))},{q(e.get('day'))},{q(e['summary'])},{q(e['description'])},{q(e.get('narrative'))},{q(e.get('classification_note'))},{q(e['region'])},{q(e['region_id'])},{q(e.get('place_id'))},{q(e['importance'])},{q(e['source_confidence'])},{qjson(e['tags'])},'active');"
        )

    for loc in builder.event_locations:
        lines.append(
            "INSERT INTO public.event_locations (id,event_id,location_name,address_raw,longitude,latitude,spatial_precision,coordinate_confidence,is_primary,source_note) VALUES "
            f"({q(loc['id'])},{q(loc['event_id'])},{q(loc['location_name'])},{q(loc.get('address_raw'))},{q(loc['longitude'])},{q(loc['latitude'])},{q(loc['spatial_precision'])},{q(loc['coordinate_confidence'])},TRUE,{q(loc.get('source_note'))});"
        )

    for person in builder.persons.values():
        lines.append(
            "INSERT INTO public.persons (id,name,aliases,summary,tags,status) VALUES "
            f"({q(person['id'])},{q(person['name'])},{qjson(person['aliases'])},{q(person['summary'])},{qjson(person['tags'])},'active');"
        )
    for item in builder.event_persons:
        lines.append(
            "INSERT INTO public.event_persons (id,event_id,person_id,role,note) VALUES "
            f"({q(stable_id('ep', item['event_id'] + item['person_id'] + item['role']))},{q(item['event_id'])},{q(item['person_id'])},{q(item['role'])},{q(item['note'])}) ON CONFLICT (event_id, person_id, role) DO NOTHING;"
        )

    for media in builder.media.values():
        lines.append(
            "INSERT INTO public.media (id,media_type,url,title,caption,is_ai_generated,source_id,status) VALUES "
            f"({q(media['id'])},{q(media['media_type'])},{q(media['url'])},{q(media['title'])},{q(media['caption'])},{q(media['is_ai_generated'])},{q(media['source_id'])},'active');"
        )
    for item in builder.media_links:
        lines.append(
            "INSERT INTO public.media_links (id,media_id,target_type,target_id,relation_type,sort_order,note) VALUES "
            f"({q(stable_id('ml', item['media_id'] + item['target_type'] + item['target_id']))},{q(item['media_id'])},{q(item['target_type'])},{q(item['target_id'])},{q(item['relation_type'])},{q(item.get('sort_order', 0))},{q(item.get('note'))});"
        )

    for item in builder.source_links:
        lines.append(
            "INSERT INTO public.source_links (id,source_id,target_type,target_id,relation_type,note) VALUES "
            f"({q(stable_id('sl', item['source_id'] + item['target_type'] + item['target_id'] + item.get('relation_type', '')))}, {q(item['source_id'])},{q(item['target_type'])},{q(item['target_id'])},{q(item.get('relation_type', 'evidence'))},{q(item.get('note'))}) ON CONFLICT DO NOTHING;"
        )

    for item in builder.geo_evidence:
        lines.append(
            "INSERT INTO public.geo_evidence (id,target_type,target_id,location_label,longitude,latitude,precision_level,confidence,evidence_type,evidence_title,note) VALUES "
            f"({q(stable_id('geo', item['target_type'] + item['target_id'] + item['location_label']))},{q(item['target_type'])},{q(item['target_id'])},{q(item['location_label'])},{q(item.get('longitude'))},{q(item.get('latitude'))},{q(item['precision_level'])},{q(item['confidence'])},{q(item['evidence_type'])},{q(item.get('evidence_title'))},{q(item.get('note'))});"
        )

    for item in builder.timeline.values():
        lines.append(
            "INSERT INTO public.timeline_entries (time_key,start_date,end_date,date_precision,sort_order,chapter_no,chapter_title,title,narration,scope,map_focus,source_context) VALUES "
            f"({q(item['time_key'])},{q(item['start_date'])},{q(item['end_date'])},{q(item['date_precision'])},{q(item['sort_order'])},{q(item.get('chapter_no'))},{q(item.get('chapter_title'))},{q(item['title'])},{q(item['narration'])},{q(item['scope'])},{qjson(item.get('map_focus', {}))}::jsonb,{q(item.get('source_context'))});"
        )
    for item in builder.timeline_links:
        lines.append(
            "INSERT INTO public.timeline_event_links (time_key,event_id,relation_type) VALUES "
            f"({q(item['time_key'])},{q(item['event_id'])},{q(item.get('relation_type', 'mentions'))}) ON CONFLICT DO NOTHING;"
        )

    for idx, item in enumerate(sorted(builder.timeline.values(), key=lambda x: (x["start_date"], x["sort_order"]))):
        linked = [x["event_id"] for x in builder.timeline_links if x["time_key"] == item["time_key"]]
        event_id = linked[0] if linked else None
        place_id = None
        if event_id:
            loc = next((x for x in builder.event_locations if x["event_id"] == event_id), None)
            if loc:
                # Link to nearest cultural place is intentionally left nullable; map_points_v uses event_locations.
                pass
        lines.append(
            "INSERT INTO public.timeline_keyframes (id,title,year,month,day,place_id,event_id,camera,description,sort_order,status) VALUES "
            f"({q(stable_id('kf', item['time_key']))},{q(item['title'])},{q(int(item['start_date'][:4]))},{q(int(item['start_date'][5:7]))},{q(int(item['start_date'][8:10]))},{q(place_id)},{q(event_id)},{qjson({})},{q(item['narration'][:500])},{idx},'active');"
        )

    lines.extend([
        "INSERT INTO public.favorites (id,user_id,place_id) SELECT 'fav-' || id, 'user-viewer', id FROM public.places WHERE slug IN ('yuezhao-songlin','wanjialing-victory-memorial-park') ON CONFLICT DO NOTHING;",
        "UPDATE public.users SET favorites = COALESCE((SELECT json_agg(place_id)::text FROM public.favorites WHERE user_id='user-viewer'), '[]') WHERE id='user-viewer';",
        "INSERT INTO public.system_configs (id,key,value,scope) VALUES ('cfg-map','map','{\"defaultBasemap\":\"terrain\",\"labelDensity\":\"standard\",\"exportApproval\":true}','global'), ('cfg-classification','eventClassification','{\"unknownPolicy\":\"map_to_mixed_only_when_actor_is_indeterminate\",\"regions\":\"derived_view_only\"}','global');",
        "INSERT INTO public.dataset_versions (id,version,title,description,source_note,status,created_by) VALUES ('dataset-2026-07-lushan','2026.07.lushan.seed','庐山抗战文化景观首版规范库','由 data 目录三份原始材料清洗生成，旧表保留在 legacy schema。','文化景观经纬度.xlsx；庐山历史归档_Table1_Default View.xlsx；庐山抗战历史事件表（批注地点坐标）.docx','active','admin-seed');",
        "INSERT INTO public.admin_logs (id,operator,operator_id,action,target,target_type,metadata) VALUES ('log-seed-2026-07','admin@shanjian.local','admin-seed','seed_database','从三份原始表生成规范数据库','dataset','{\"script\":\"scripts/seed_lushan_platform.py\"}');",
        "COMMIT;",
    ])
    output.write_text("\n".join(lines), encoding="utf-8")


def build_seed(output: Path) -> None:
    catalog = LocationCatalog()
    seed_manual_catalog(catalog)
    builder = SeedBuilder()
    builder.add_source("src-culture-coords", "文化景观经纬度.xlsx", "spreadsheet", str(DATA_DIR / "文化景观经纬度.xlsx"), note="文化景观常态展示点坐标基线。")
    builder.add_source("src-history-archive-xlsx", "庐山历史归档_Table1_Default View.xlsx", "spreadsheet", str(DATA_DIR / "庐山历史归档_Table1_Default View.xlsx"), note="50 条档案摘录，用于事件证据和补充叙事。")
    builder.add_source("src-timeline-docx", "庐山抗战历史事件表（批注地点坐标）.docx", "document", str(DATA_DIR / "庐山抗战历史事件表（批注地点坐标）.docx"), note="五幕时间线与现存遗址清单。")
    builder.add_source("src-project-assets", "项目内置图片资产", "asset", "public/assets/places", note="用于文化景观详情图像展示，AI 图像在 media.is_ai_generated 中标记。")
    builder.add_source("src-web-research", "公开网页坐标/地址核验", "web", "Wikipedia / public web pages", note="用于补充道路、村庄、文保点位置说明。")

    for place in read_cultural_places(catalog):
        builder.add_raw("文化景观经纬度.xlsx", "xlsx", f"row-{place['source_row']}", place, "Sheet1", int(place["source_row"]))
        builder.add_place(place, "src-culture-coords")
    build_from_docx(builder, catalog)
    build_from_archive_xlsx(builder, catalog)
    make_media(builder)
    emit_sql(builder, output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "server/database/002_lushan_platform_seed.generated.sql"))
    args = parser.parse_args()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    build_seed(out)
    print(out)


if __name__ == "__main__":
    main()



