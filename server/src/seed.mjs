import { dbPath, initSchema, run } from './db.mjs';
import { admins, events, exportRequests, logs, media, persons, places, regions, sources, submissions, users } from './seed-data.mjs';

initSchema();

for (const user of users) {
  run('INSERT OR REPLACE INTO users (id,email,nickname,password_hash,role,favorites) VALUES ($id,$email,$nickname,$passwordHash,$role,$favorites)', { ...user, favorites: JSON.stringify(user.favorites) });
}
for (const admin of admins) {
  run('INSERT OR REPLACE INTO admins (id,email,nickname,password_hash,role) VALUES ($id,$email,$nickname,$passwordHash,$role)', admin);
}
for (const region of regions) {
  run('INSERT OR REPLACE INTO regions (id,name,count) VALUES ($id,$name,$count)', region);
}
for (const place of places) {
  run(`INSERT OR REPLACE INTO places (id,name,slug,place_type,longitude,latitude,altitude,geom,region_id,region,start_year,end_year,highlight_level,base_info,summary,tags,status)
       VALUES ($id,$name,$slug,$placeType,$longitude,$latitude,$altitude,$geom,$regionId,$region,$startYear,$endYear,$highlightLevel,$baseInfo,$summary,$tags,'active')`, {
    ...place,
    geom: JSON.stringify({ type: 'Point', coordinates: [place.longitude, place.latitude] }),
    tags: JSON.stringify(place.tags),
  });
}
for (const event of events) {
  run('INSERT OR REPLACE INTO events (id,title,start_time_raw,normalized_start,year,month,summary,region,place_id) VALUES ($id,$title,$startTimeRaw,$normalizedStart,$year,$month,$summary,$region,$placeId)', event);
}
for (const person of persons) {
  run('INSERT OR REPLACE INTO persons (id,name,aliases,summary) VALUES ($id,$name,$aliases,$summary)', { ...person, aliases: JSON.stringify(person.aliases) });
}
for (const item of media) {
  run('INSERT OR REPLACE INTO media (id,media_type,url,title,caption,is_ai_generated,source_id) VALUES ($id,$mediaType,$url,$title,$caption,$isAiGenerated,$sourceId)', { ...item, url: item.url ?? null, sourceId: item.sourceId ?? null, isAiGenerated: item.isAiGenerated ? 1 : 0 });
}
for (const source of sources) {
  run('INSERT OR REPLACE INTO sources (id,title,source_type,citation,note) VALUES ($id,$title,$sourceType,$citation,$note)', source);
}
for (const item of submissions) {
  run('INSERT OR REPLACE INTO ugc_submissions (id,submission_type,title,submitter,source_note,status,created_at) VALUES ($id,$submissionType,$title,$submitter,$sourceNote,$status,$createdAt)', item);
}
for (const item of exportRequests) {
  run('INSERT OR REPLACE INTO export_requests (id,request_id,applicant,data_scope,reason,status,created_at) VALUES ($id,$requestId,$applicant,$dataScope,$reason,$status,$createdAt)', item);
}
for (const item of logs) {
  run('INSERT OR REPLACE INTO admin_logs (id,operator,action,target,created_at) VALUES ($id,$operator,$action,$target,$createdAt)', item);
}
run('INSERT OR REPLACE INTO system_configs (id,key,value) VALUES ($id,$key,$value)', { id: 'cfg-map', key: 'map', value: JSON.stringify({ defaultBasemap: 'terrain', labelDensity: 'standard', exportApproval: true }) });

console.log(`Seed complete: ${dbPath}`);
