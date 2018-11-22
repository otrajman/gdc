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

async function get(drive, fileId = null) {
  if (!fileId) fileId = process.argv[3];
  const fields = 'id, name, parents';
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
      return file.data.id;
    }
    else console.log(JSON.stringify(file));
  }
}

async function list(drive) {
  let pageToken = null;
  let q = process.argv.slice(3).join(' ');
  if (!q) {
    const root = await get(drive, 'root');
    q = `'${root}' in parents`;
  }
  console.log(`Listing ${q}`);
  const pageSize = 1000;
  const fields = 'nextPageToken, files(id, name, parents)';
  let total = 0;
  while (true) {
    const ls = await drive.files.list({
      pageSize,
      pageToken,
      fields, 
      q,
    }).catch(e => {
      console.error(`Error listing files ${q}`, e.code, e.message,
       e.response.statusText, e.response.data.error_description);
    });

    //q = null;

    if (ls) {
      if (ls.data) {
	if (ls.data.files.length === 0) break;
        pageToken = ls.data.nextPageToken;
        for (const file of ls.data.files) console.log(file.name); //JSON.stringify(file));
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
    default: console.log('Usage: gdc commmand');
  }
}

main().catch(e => {
  console.log(e);
});
