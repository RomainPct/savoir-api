/**
 * Initialisation
 */
const { Api, JsonRpc, RpcError } = require('eosjs'),
      ecc = require('eosjs-ecc'),
      { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig'),
      fetch = require('node-fetch'),
      { TextEncoder, TextDecoder } = require('util'),
      { Client } = require('pg')

const http = require('http'),
      url = require('url'),
      querystring = require('querystring')

const endpoint = 'http://213.202.230.42:8888',
      supplier = 'projetsavoir'

/**
 * Postgre
 */
const postgre = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: true
})
postgre.connect()

function saveTransactionInPostgre(p,from,to,tokensAmount,handler) {
  const tokens = parseInt(Math.round(tokensAmount * 10000))
  const query = 'INSERT INTO transactions( senderaccount, receiveraccount, tokensAmount, savoirtopic, savoirname, country, zipcode ) VALUES ( $1, $2, $3, $4, $5, $6, $7 ) RETURNING *'
  const values = [from,to,tokens,p.category,p.name,p.country,p.zipcode]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : res.rows[0])
    handler()
  })
}
function getLastTransactionsInPostgre(handler) {
  const query = 'SELECT * FROM transactions ORDER BY transactionDate DESC LIMIT 10'
  postgre.query(query, (err, res) => {
    console.log(err ? err.stack : res.rows)
    handler(JSON.stringify(res.rows))
  })
}
function getTransactionsOfUserForCategoryInPostgre(category,userAccount,handler) {
  const query = 'SELECT * FROM transactions WHERE savoirtopic = $1 AND (senderaccount = $2 OR receiveraccount = $2) ORDER BY transactionDate DESC'
  const values = [category,userAccount]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : res.rows)
    handler(JSON.stringify(res.rows))
  })
}
function getCategoriesOfUser(userAccount,handler){
  const query = `SELECT t.savoirtopic, SUM(t.tokensamount) as tokensAmount, SUM((t.senderaccount != '${supplier}')::int) as received, SUM((t.senderaccount = '${supplier}')::int) as send FROM transactions as t WHERE receiveraccount = $1 GROUP BY t.savoirtopic`
  const values = [userAccount]
  postgre.query(query, values, (err, res) => {
    console.log(err ? err.stack : res.rows)
    handler(JSON.stringify(res.rows))
  })
}
function getUsers(searchStr,handler) {
  const query = `SELECT t.receiveraccount as user, SUM(t.tokensamount) as tokensAmount FROM transactions as t WHERE t.receiveraccount LIKE '${searchStr}%' GROUP BY t.receiveraccount LIMIT 5`
  console.log(query)
  postgre.query(query, (err, res) => {
    console.log(err ? err.stack : res.rows)
    handler(JSON.stringify(res.rows))
  })
}

/**
 * EOS Blockchain
 */

function saveTransactionInEosBlockchain(destinationAccount,amount,memo) {
  const projetsavoirPrivateKey = "5Jm3i6jc9tVtcH1aLVKUw1o1WmZ3ddHZpFvVYkmjYdbPdrHs97q"
  const signatureProvider = new JsSignatureProvider([projetsavoirPrivateKey])
  const rpc = new JsonRpc(endpoint, { fetch })
  const api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() })
  (async () => {
    try {
      const result = await api.transact({
        actions: [{
          account: supplier,
          name: `transfer`,
          authorization: [{
            actor: supplier,
            permission: `active`,
          }],
          data: {
            from: supplier,
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

/**
 * NodeJs Helper
 */
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

/**
 * Global send tokens function
 */
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
      saveTransactionInPostgre(p,p.from,p.to,receiverAmount,() => {
        saveTransactionInPostgre(p,supplier,p.to,() => {
          // saveTransactionInEosBlockchain(p.to,receiverAmount,memo)
          // Send tokens to the sender
          // saveTransactionInEosBlockchain(p.to,giverAmount,memo)
          handler(memo)
          return
        })
      })
    } else {
      handler('Private key does not match with the savoir sender')
      return
    }
  })
}

/**
 * Server rooting
 */

const server = http.createServer(function (req, res) {
  const page = url.parse(req.url).pathname
  if (page == '/send_sor' && req.method == 'POST') {
    collectRequestData(req, post => {
      send_tokens(post,(result) => {
        res.writeHead(200)
        res.end(result)
      })
    })
  } else if (page == '/get_last_transactions' && req.method == 'POST') {
    collectRequestData(req, post => {
      getLastTransactionsInPostgre((data) => {
        res.writeHead(200)
        res.end(data)
      })
    })
  } else if (page == '/get_user_categories' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.account) {
        getCategoriesOfUser(post.account,(data) => {
          res.writeHead(200)
          res.end(data)
        })
      } else {
        res.writeHead(200)
        res.end('Bad parameters for get user categories')
      }
    })
  } else if (page == '/get_transactions_of_user_for_category' && req.method == 'POST') {
    collectRequestData(req, post => {
      if (post.category && post.account) {
        getTransactionsOfUserForCategoryInPostgre(post.category,post.account,(data) => {
          res.writeHead(200)
          res.end(data)
        })
      } else {
        res.writeHead(200)
        res.end('Bad parameters for get transactions of user for category')
      }
    })
  } else if (page == '/get_users_for_search' && req.method == 'POST') {
    collectRequestData(req, post => {
      getUsers(post.search,(data) => {
        res.writeHead(200)
        res.end(data)
      })
    })
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(process.env.PORT || 8080, () => {
  console.log(`I run on port ${process.env.PORT || 8080}`)
})