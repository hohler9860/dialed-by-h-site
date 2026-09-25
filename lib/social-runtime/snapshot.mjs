// Durable state is stored in Postgres. SQLite is only the invocation-local rules engine.
export const tables=['settings','sources','feeds','media','posts','leads','events','credentials','oauth','admin_handoffs','jobs','spend','post_verifications','editorial_reviews'];
export function restore(db,state){
  if(!state?.tables)return;
  if(state.version!==1)throw new Error('Unsupported publishing state version.');
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const table of [...tables].reverse())db.prepare(`DELETE FROM ${table}`).run();
    for(const table of tables){
      const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      for(const row of state.tables[table]||[]){
        if(Object.keys(row).some(k=>!cols.includes(k)))throw new Error('Invalid publishing state column.');
        const keys=cols.filter(k=>k in row);
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
      }
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function snapshot(db){
  const state={version:1,tables:Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]))};
  if(Buffer.byteLength(JSON.stringify(state))>8*1024*1024)throw new Error('Publishing state needs archiving before more work can run.');
  return state;
}
