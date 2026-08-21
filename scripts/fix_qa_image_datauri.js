const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const FILENAME = '1787282666982_a6221u1t.png';
const imgPath = path.join(
  'c:/xampp/htdocs/bomiora/www/data/qa_images',
  FILENAME
);

async function main() {
  const buf = fs.readFileSync(imgPath);
  const dataUri = `data:image/png;base64,${buf.toString('base64')}`;

  const pool = await mysql.createPool({
    host: 'bomiora0.mycafe24.com',
    user: 'bomiora0',
    password: 'BMdiet8972!!',
    database: 'bomiora0',
  });

  const [rows] = await pool.query(
    'SELECT wr_id, wr_content FROM bomiora_write_online WHERE wr_content LIKE ? LIMIT 20',
    [`%${FILENAME}%`]
  );
  console.log('found', rows.length);

  for (const r of rows) {
    let c = String(r.wr_content || '');
    const original = c;
    c = c.replace(
      new RegExp(`https?:\\/\\/[^"'\\s>]*\\/api\\/qa\\/images\\/${FILENAME.replace('.', '\\.')}`, 'g'),
      dataUri
    );
    c = c.replace(new RegExp(`\\/api\\/qa\\/images\\/${FILENAME.replace('.', '\\.')}`, 'g'), dataUri);
    c = c.replace(
      new RegExp(`\\.\\/qa_image\\.php\\?f=${FILENAME.replace('.', '\\.')}`, 'g'),
      dataUri
    );
    c = c.replace(
      new RegExp(`https?:\\/\\/bomiora0\\.mycafe24\\.com\\/data\\/qa_images\\/${FILENAME.replace('.', '\\.')}`, 'g'),
      dataUri
    );

    if (c !== original) {
      await pool.query('UPDATE bomiora_write_online SET wr_content = ? WHERE wr_id = ?', [
        c,
        r.wr_id,
      ]);
      console.log('updated wr_id', r.wr_id, 'len', original.length, '->', c.length);
    } else {
      console.log('no change wr_id', r.wr_id);
      console.log('tail:', original.slice(-180));
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
