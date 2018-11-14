const axios = require('axios');
const http = require('http');
const url = require('url');

const GET_AUTH = 'https://us-central1-api-project-776336016997.cloudfunctions.net/auth';

const GET_CODE = 'https://us-central1-api-project-776336016997.cloudfunctions.net/token';

async function main() {
  const auth_url = await axios(GET_AUTH);
  console.log(`Open a browser to ${auth_url.data} to authenticate your account`);
  const auth_code = await new Promise(c => {
    const server = http.createServer((req, res) => {
      const query = url.parse(req.url, true).query;
      res.writeHead(200);
      res.end();
      c(query.code);
    });
    server.listen(8123);
  });

  console.log(auth_code);
  const tokens = await axios(`${GET_CODE}?code=${auth_code}`);
  console.log(JSON.stringify(tokens.data));
}

main().catch(e => {
  console.log(e);
});
