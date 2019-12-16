const { Api, JsonRpc, RpcError } = require('eosjs'),
      ecc = require('eosjs-ecc'),
      { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig'),
      fetch = require('node-fetch'),
      { TextEncoder, TextDecoder } = require('util'),
      { Client } = require('pg')

const http = require('http'),
      url = require('url'),
      querystring = require('querystring')

const postgre = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: true
})

function saveTransaction() {
  postgre.connect()
  postgre.query('INSERT INTO transactions( senderaccount, receiveraccount, tokensAmount, savoirtopic, savoirname, country, zipcode ) VALUES ( "loup2lemaire", "nicolas2decr", 1, "blockchain", "Tutoriel blockchain ensemble", "fra", "94160" )',
  (err, res) => {
    if (err) throw err
    for (let row of res.rows) {
      console.log(JSON.stringify(row))
    }
    postgre.end()
  })
}

const endpoint = 'http://213.202.230.42:8888'

function send_sor_tokens(destinationAccount,amount,memo) {
  const projetsavoirPrivateKey = "5Jm3i6jc9tVtcH1aLVKUw1o1WmZ3ddHZpFvVYkmjYdbPdrHs97q"; // projetsavoir active private key
  const signatureProvider = new JsSignatureProvider([projetsavoirPrivateKey]);
  const rpc = new JsonRpc(endpoint, { fetch });
  const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
  (async () => {
    try {
      const result = await api.transact({
        actions: [{
          account: `projetsavoir`,
          name: `transfer`,
          authorization: [{
            actor: `projetsavoir`,
            permission: `active`,
          }],
          data: {
            from: `projetsavoir`,
            to: destinationAccount,
            quantity: `${amount} SOR`,
            memo: memo,
          },
        }]
      }, {
        blocksBehind: 3,
        expireSeconds: 30,
      });
      console.dir(result);
    } catch (e) {
      console.log('\nCaught exception: ' + e);
      if (e instanceof RpcError)
        console.log(JSON.stringify(e.json, null, 2));
    }
  })()
}

function collectRequestData(request, callback) {
  const FORM_URLENCODED = 'application/x-www-form-urlencoded';
  if(request.headers['content-type'] === FORM_URLENCODED) {
      let body = '';
      request.on('data', chunk => {
          body += chunk.toString();
      });
      request.on('end', () => {
          callback(querystring.parse(body));
      });
  }
  else {
      callback(null);
  }
}

function send_tokens(p,handler) {
  if (!p.from || p.from.length != 12) {
    handler('Savoir giver is not correct => Fill the "from" parameter with a 12 characters eos account name')
    return
  }
  if (!p.fromOwnerPrivateKey) {
    handler('Savoir giver private key is null => Fill the "fromOwnerPrivateKey" with your owner private key')
    return
  }
  try {
    p.fromOwnerPublicKey = ecc.privateToPublic(p.fromOwnerPrivateKey)
  } catch {
    handler('Provided key is not a private key')
    return
  }
  if (!p.to || p.to.length != 12) {
    handler('Savoir receiver is not correct  => Fill the "to" parameter with a 12 characters eos account name')
    return
  }
  if (p.from == p.to) {
    handler('You can\'t send savoir to yourself')
    return
  }
  if (!p.category) {
    handler('Savoir category is not defined => Fill the "category" parameter')
    return
  }
  if (!p.country || p.country.length != 3) {
    handler('Savoir country is not correct => Fill the "country" parameter with a ISO 3166 Alpha-3 code : https://www.iban.com/country-codes')
    return
  }
  if (!p.zipcode) {
    handler('Savoir zip code is not defined => Fill the "zipcode" parameter')
    return
  }
  if (!p.name) {
    handler('Savoir name is not defined => Fill the "name" parameter')
    return
  }
  confirmAccount(p.fromOwnerPublicKey,p.from,(result) => {
    if (result) {
      console.log(p)
      const memo = encodeURI(`${p.from}__${p.category}__${p.country}__${p.zipcode}__${p.name}`)
      // Define how many to send to each person
      const receiverAmount = 0.0001
      const giverAmount = 0.0001
      // Send tokens to the receiver
      saveTransaction()
      // send_sor_tokens(p.to,receiverAmount,memo)
      // Send tokens to the sender
      // send_sor_tokens(p.to,giverAmount,memo)
      handler(memo)
      return
    } else {
      handler('Private key does not match with the savoir sender')
      return
    }
  })
}

function confirmAccount(pubKey,accountName,handler) {
  const options = { 'public_key':pubKey }
  fetch(`${endpoint}/v1/history/get_key_accounts`, {
    method: 'post',
    body: JSON.stringify(options)
  }).then(function(response) {
      return response.json()
  }).then(function(data) {
      handler(data.account_names.includes(accountName))
  })
}

const server = http.createServer(function (req, res) {
  const page = url.parse(req.url).pathname
  if (page == '/send_sor' && req.method == 'POST') {
    collectRequestData(req, post => {
      send_tokens(post,(result) => {
        res.writeHead(200)
        res.end(result)
      })
    })
  } else if (page == 'get_last_transactions' && req.method == 'POST') {
    res.writeHead(200)
    res.end('get_last_transactions')
  } else if (page == 'get_user_topics' && req.method == 'POST') {
    res.writeHead(200)
    res.end('get_user_topics')
  } else if (page == 'get_transactions_of_user_for_category' && req.method == 'POST') {
    res.writeHead(200)
    res.end('get_transactions_of_user_for_category')
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(process.env.PORT || 8080, () => {
  console.log(`I run on port ${process.env.PORT || 8080}`)
})