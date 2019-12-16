const { Client } = require('pg')

class Postgre {

    constructor() {
        this.postgre = new Client({
            connectionString: process.env.DATABASE_URL,
            ssl: true
          })
    }

    saveTransactionInPostgre(p,tokensAmount,handler) {
        this.postgre.connect()
        const tokens = parseInt(Math.round(tokensAmount * 10000))
        const query = 'INSERT INTO transactions( senderaccount, receiveraccount, tokensAmount, savoirtopic, savoirname, country, zipcode ) VALUES ( $1, $2, $3, $4, $5, $6, $7 ) RETURNING *'
        const values = [p.from,p.to,tokens,p.category,p.name,p.country,p.zipcode]
        this.postgre.query(query, values, (err, res) => {
            console.log(err ? err.stack : res.rows[0])
            postgre.end()
            handler()
        })
      }

}

module.exports = {
    Postgre: Postgre
}