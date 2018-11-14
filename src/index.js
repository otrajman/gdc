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
        res.end(SUCCESS);
        c(query.code);
      });
      server.listen(8123);
    });

    console.log(auth_code);
    tokens = await axios(`${GET_CODE}?code=${auth_code}`);
    console.log(JSON.stringify(tokens.data));
    fs.writeFileSync(GDC_CONFIG, JSON.stringify({tokens}));
  }

  return tokens;
}

async function main() {
  const tokens = await getTokens().catch(e => {
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
  const ls = await drive.files.list({
    pageSize: 10,
    fields: 'nextPageToken, files(id, name)',
  });

  console.log(JSON.stringify(ls.data));
}

main().catch(e => {
  console.log(e);
});
