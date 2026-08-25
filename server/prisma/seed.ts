import { PrismaClient } from '@prisma/client';
// @ts-ignore seed data is a plain ESM module shared with the fallback API.
import { admins, events, exportRequests, logs, media, persons, places, regions, sources, submissions, users } from '../src/seed-data.mjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.datasetVersion.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.downloadRecord.deleteMany();
  await prisma.timelineKeyframe.deleteMany();
  await prisma.placeRelation.deleteMany();
  await prisma.sourceLink.deleteMany();
  await prisma.mediaLink.deleteMany();
  await prisma.eventPerson.deleteMany();
  await prisma.placeEvent.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.ugcSubmission.deleteMany();
  await prisma.exportRequest.deleteMany();
  await prisma.adminLog.deleteMany();
  await prisma.systemConfig.deleteMany();
  await prisma.media.deleteMany();
  await prisma.source.deleteMany();
  await prisma.person.deleteMany();
  await prisma.event.deleteMany();
  await prisma.place.deleteMany();
  await prisma.region.deleteMany();
  await prisma.session.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();

  for (const user of users) {
    await prisma.user.create({ data: { id: user.id, email: user.email, nickname: user.nickname, passwordHash: user.passwordHash, role: user.role, favorites: JSON.stringify(user.favorites) } });
    for (const placeId of user.favorites) await prisma.favorite.create({ data: { id: `${user.id}-${placeId}`, userId: user.id, placeId } });
  }
  for (const admin of admins) await prisma.admin.create({ data: { id: admin.id, email: admin.email, nickname: admin.nickname, passwordHash: admin.passwordHash, role: admin.role } });
  for (const region of regions) await prisma.region.create({ data: { id: region.id, name: region.name, count: region.count } });
  for (const place of places) {
    await prisma.place.create({ data: {
      id: place.id,
      name: place.name,
      slug: place.slug,
      placeType: place.placeType,
      longitude: place.longitude,
      latitude: place.latitude,
      altitude: place.altitude,
      geom: JSON.stringify({ type: 'Point', coordinates: [place.longitude, place.latitude] }),
      regionId: place.regionId,
      region: place.region,
      startYear: place.startYear,
      endYear: place.endYear,
      highlightLevel: place.highlightLevel,
      baseInfo: place.baseInfo,
      summary: place.summary,
      tags: JSON.stringify(place.tags),
      status: 'active',
    } });
  }
  for (const event of events) {
    await prisma.event.create({ data: {
      id: event.id,
      title: event.title,
      startTimeRaw: event.startTimeRaw,
      normalizedStart: event.normalizedStart,
      year: event.year,
      month: event.month,
      summary: event.summary,
      region: event.region,
      placeId: event.placeId,
    } });
    await prisma.placeEvent.create({ data: { id: `pe-${event.id}`, placeId: event.placeId, eventId: event.id, relationType: 'keyframe' } });
  }
  for (const person of persons) await prisma.person.create({ data: { id: person.id, name: person.name, aliases: JSON.stringify(person.aliases), summary: person.summary } });
  const mediaUrlById: Record<string, string> = {
    m1: '/assets/places/ai-yuezhao-songlin.png',
    m2: '/assets/places/ai-heshan-buer-entrance.png',
  };
  for (const item of media) await prisma.media.create({ data: { id: item.id, mediaType: item.mediaType, url: item.url ?? mediaUrlById[item.id] ?? null, title: item.title, caption: item.caption, isAiGenerated: item.isAiGenerated, sourceId: item.sourceId } });
  for (const source of sources) await prisma.source.create({ data: { id: source.id, title: source.title, sourceType: source.sourceType, citation: source.citation, note: source.note } });

  for (const place of places) {
    const sourceId = place.id === 'pl9' || place.id === 'pl10' ? 's-wanjialing' : place.id === 'pl1' ? 's-yuezhao' : 's-lushan-sites';
    await prisma.sourceLink.create({ data: { id: `sl-${place.id}`, sourceId, targetType: 'place', targetId: place.id, relationType: 'baseline', note: '演示数据来源绑定；正式发布前需进入来源核验流程。' } });
    await prisma.mediaLink.create({ data: { id: `ml-${place.id}`, mediaId: place.id === 'pl1' || place.id === 'pl2' || place.id === 'pl8' || place.id === 'pl10' ? 'm2' : 'm1', targetType: 'place', targetId: place.id, relationType: 'hero', sortOrder: 1 } });
  }
  await prisma.placeRelation.create({ data: { id: 'rel-guling-political', fromPlaceId: 'pl5', toPlaceId: 'pl6', relationType: 'political_context', title: '庐山政治活动空间线索', note: '连接庐山谈话、国共合作与近代别墅群空间。', weight: 3 } });
  await prisma.placeRelation.create({ data: { id: 'rel-wanjialing-doc', fromPlaceId: 'pl9', toPlaceId: 'pl10', relationType: 'archive_support', title: '战役记忆与地方史料承接', note: '连接万家岭战役纪念空间与地方博物馆史料承接。', weight: 3 } });

  await prisma.timelineKeyframe.createMany({ data: [
    { id: 'kf-1937-07', title: '七七事变', year: 1937, month: 7, eventId: 'e1', placeId: 'pl5', description: '全国抗战全面爆发，庐山相关政治表达进入抗战叙事背景。', sortOrder: 1 },
    { id: 'kf-1938-03', title: '台儿庄战役', year: 1938, month: 3, description: '抗战初期重要胜利，作为全国抗战时间轴标志性节点。', sortOrder: 2 },
    { id: 'kf-1940-08', title: '百团大战', year: 1940, month: 8, description: '敌后战场大规模主动出击，作为全国抗战时间轴标志性节点。', sortOrder: 3 },
    { id: 'kf-1945-08', title: '日本投降', year: 1945, month: 8, eventId: 'e6', placeId: 'pl3', description: '中国人民抗日战争取得胜利，相关纪念与归档叙事展开。', sortOrder: 4 },
  ] });

  for (const item of submissions) await prisma.ugcSubmission.create({ data: { id: item.id, submissionType: item.submissionType, title: item.title, submitter: item.submitter, sourceNote: item.sourceNote, status: item.status, createdAt: new Date(item.createdAt) } });
  for (const item of exportRequests) await prisma.exportRequest.create({ data: { id: item.id, requestId: item.requestId, applicant: item.applicant, dataScope: item.dataScope, reason: item.reason, status: item.status, createdAt: new Date(item.createdAt) } });
  for (const item of logs) await prisma.adminLog.create({ data: { id: item.id, operator: item.operator, action: item.action, target: item.target, createdAt: new Date(item.createdAt.replace(' ', 'T')) } });
  await prisma.systemConfig.create({ data: { id: 'cfg-map', key: 'map', value: JSON.stringify({ defaultBasemap: 'terrain', labelDensity: 'standard', exportApproval: true }) } });
  await prisma.datasetVersion.create({ data: { id: 'dataset-demo-202605', version: 'demo-2026-05', title: '山鉴 P0 演示数据集', description: '十个点位、核心事件、人物、媒体与来源的本地调试数据。', sourceNote: '坐标以文化景观经纬度.xlsx为基线；内容为演示资料，正式发布前需史料核验。', status: 'active', createdBy: 'admin@shanjian.local' } });
  await prisma.notification.create({ data: { id: 'n-seed-review', userId: 'user-viewer', title: '资料提交已进入审核', content: '你的演示提交已进入后台审核队列。' } });
}

main()
  .then(() => console.log('Prisma seed complete: users/admins/10 places/timeline/admin queues'))
  .finally(async () => prisma.$disconnect());
