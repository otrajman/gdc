const axios = require('axios');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const GET_AUTH = 'https://us-central1-api-project-776336016997.cloudfunctions.net/auth';

const GET_CODE = 'https://us-central1-api-project-776336016997.cloudfunctions.net/token';

const GDC_CONFIG = path.resolve(process.env.HOME, '.gdc');

const CLIENT_ID = '776336016997-78620vidg4eiqoqbjq3gfc7g0evkuvn8.apps.googleusercontent.com';

const SUCCESS = fs.readFileSync(path.resolve(__dirname, 'success.html'));

const ERROR = fs.readFileSync(path.resolve(__dirname, 'error.html'));

async function getTokens() {
  let tokens = null;
  try {
    const jtokens = fs.readFileSync(GDC_CONFIG);
    tokens = JSON.parse(jtokens).tokens;
  } catch(e) {
    console.log(e.message);
    const auth_url = await axios(GET_AUTH);
    console.log(`Open a browser to ${auth_url.data} to authenticate your account`);
    const auth_code = await new Promise(c => {
      const server = http.createServer((req, res) => {
        const query = url.parse(req.url, true).query;
        res.writeHead(200);
        if (query.code) {
	  res.end(SUCCESS);
          c(query.code);
        } else {
	  res.end(ERROR);
	  c(null);
	}
      });
      server.listen(8123);
    });

    //console.log(auth_code);
    const tdata = await axios(`${GET_CODE}?code=${auth_code}`);
    tokens = tdata.data;
    //console.log(JSON.stringify(tokens));
    if (tokens) fs.writeFileSync(GDC_CONFIG, JSON.stringify({tokens}));
  }

  if (tokens && new Date(tokens.expiry_date) < new Date()) {
    //console.log(tokens.refresh_token);
    const tdata = await axios(`${GET_CODE}?refresh=${tokens.refresh_token}`);
    tokens = tdata.data;
    //console.log(JSON.stringify(tokens));
    if (tokens) fs.writeFileSync(GDC_CONFIG, JSON.stringify({tokens}));
  }

  return tokens;
}

async function get(drive, fileId = null, data = true) {
  let save_file = null;
  let fetch_data = [];
  if (!fileId) {
    if (process.argv.length > 3) fileId = process.argv[3];
    if (process.argv.length > 4) save_file = process.argv[4];
  }
  const fields = 'id, name, parents, createdTime, modifiedTime';
  const file = await drive.files.get({
    fileId,
    fields,
  }).catch(e => {
    console.error(`Error getting file ${fileId}`, e.code, e.message,
     e.response.statusText, e.response.data.error_description);
  });
 
  if (file) {
    if (file.data) {
      console.log(JSON.stringify(file.data));
      let file_data = null;
      if (data) {
	console.log('Fetching data');
        file_data = await drive.files.get({
          fileId,
          alt: 'media',
        }, {responseType: 'stream'}).catch(e => {
          console.error(`Error getting file data ${fileId}`, e.code, e.message,
            e.response.statusText, e.response.data.error_description);
        });

        if (file_data) {
          await new Promise((c,r) => {
            if (!save_file) save_file = file.data.name;

            const base = save_file;
            let index = 0;
            while (fs.existsSync(save_file)) {
              console.log(save_file);
              save_file = `${base} (${index})`;
              index++;
	    }

	    //console.log(`Saving ${file_data.data.length} bytes to ${save_file}`);
	   //fs.writeFileSync(save_file, file_data.data);
	    const out = fs.createWriteStream(save_file);
	    let bytes = 0;

	    file_data.on('end', () => {
	      console.log(`Fetched ${bytes} bytes`); 
	      c();
	    }).on('error', err => {
              console.error('Fetch error', err);
	    }).on('data', d => {
	      bytes += bytes;
	    }).pipe(out);
          });
	} else console('Fetch failed');
      }

      return {
	id:file.data.id,
	name:file.data.name,
	created: file.data.createdTime,
	modified: file.data.modifiedTime,
	parents:file.data.parents,
	data:Buffer.concat(fetch_data),
      }
    }
    else console.log(JSON.stringify(file));
  }
}

async function list(drive) {
  let pageToken = null;
  let path = process.argv.slice(3).join(' ');
  const root = await get(drive, 'root', false);
  const q = [`'${root.id}' in parents`];
  if (path) {
    const paths = path.split(/\/\\/);
    q.push(`and name = ${paths[0]}`);
  }
  
  console.log(`Listing ${q}`);
  const pageSize = 1000;
  const fields = 'nextPageToken, files(id, name, parents, createdTime, modifiedTime)';
  let total = 0;
  while (true) {
    const ls = await drive.files.list({
      pageSize,
      pageToken,
      fields,
      q:q.join(' '),
    }).catch(e => {
      console.error(`Error listing files ${q}`, e.code, e.message,
       e.response.statusText, e.response.data.error_description);
    });

    //q = null;

    if (ls) {
      if (ls.data) {
	if (ls.data.files.length === 0) break;
        pageToken = ls.data.nextPageToken;
        for (const file of ls.data.files) console.log(`${file.name} ${file.id} ${file.modifiedTime}`); //JSON.stringify(file));
	total += ls.data.files.length;
      }
      else {
	console.log(JSON.stringify(ls));
	break;
      }
    } else break;

    if (!pageToken) break;
  }

  console.log(`${total} files`)
}

async function main() {
  const tokens = await getTokens().catch(err => {
    console.error('Error getting tokens', err.code, err.message, err.stack);
  });

  if (!tokens) {
    console.error('No tokens');
    process.exit();
  }

  console.log('Ready');
  const auth = new google.auth.OAuth2(CLIENT_ID);
  auth.setCredentials(tokens);

  const drive = google.drive({version: 'v3', auth});

  switch (process.argv[2]) {
    case 'get':
      await get(drive);
      break;
    case 'ls':
      await list(drive);
      break;
    case 'help':
     console.log('Commands:');
     console.log('  get <file_id> [output]');
     console.log('  ls [path]');
    default: console.log('Usage: gdc commmand');
  }
}

main().catch(e => {
  console.log(e);
});
