const express = require('express')
const app = express()
const cors = require('cors')
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion ,ObjectId} = require('mongodb');

// environment variables middleware
require('dotenv').config()

// json web token
var jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

// middleware
app.use(cors())
app.use(express.json()) 

const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.q2uyg12.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


//  ekhane client site theke pathano localstorage er token verify kora hoy
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization
    if(!authHeader){
        return res.status(401).send({message:'UnAuthorized access denied'});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN , function(err, decoded){
        if(err){
            return res.status(403).send({message:'Forbidden access'});
          }
       req.decoded = decoded;
       next()
      });
}

async function run( ){
    try{
        await client.connect()
        const toolsCollection = client.db('tools').collection('tool');
        const usersCollection = client.db('users').collection('user');
        const soldToolsCollection = client.db('sellTools').collection('sellTool');
        const reviewsCollection = client.db('reviews').collection('review');
        console.log('Connect successfully   database connection')

        // --------------------down all get api --------------

        // get all tools for tools page and manage tools (home)
        app.get('/tools',async(req, res) => {
            const query = req.query
            const cursor = toolsCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)
         })
         
        //  get one tool for buy now page (user)
        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id
            const query = {_id:ObjectId(id)}
            const result = await toolsCollection.findOne(query)
            res.send(result)
        })
        
        // get all order tools for manage all order tools(admin , dashboard)
        app.get('/soldTools',verifyJWT, async (req, res) => {
            const query = {}
            const result = await soldToolsCollection.find(query).toArray()
            res.send(result)
        })

        //  get user order all tools for my order page (dashboard) 
        app.get('/soldTools/:email',verifyJWT, async (req, res) => {
            const email = req.params.email
            const decodedEmail = req.decoded.email 
            if(email === decodedEmail){
              const filter = {email: email}
              const result = await soldToolsCollection.find(filter).toArray()
               return res.send(result)
            }
            else{
                return res.status(403).send({message:'Forbidden Request'})
            }
        })

        // get one unpaid tool for payment page (dashboard)
        app.get('/soldTool/:id', async (req, res) => {
            const id = req.params.id
            const filter = {_id:ObjectId(id)}
            const result = await soldToolsCollection.findOne(filter)
            res.send(result)
        })

        // get all users for make admin page (admin er jonno , dashboard)
        app.get('/users',verifyJWT, async (req, res) => {
            const query = req.query
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        
        // get one user for my profile page and edit profile page (dashboard)
        app.get('/user/:email', async (req, res) => {
           const email = req.params.email
           const filter = {email: email}
           const result = await usersCollection.findOne(filter)
           res.send(result)
        })

        // get all reviews for review page (home)
        app.get('/reviews', async (req, res) => {
            const query = {}
            const result = await reviewsCollection.find(query).toArray()
            res.send(result)
        })

        //  ---------- down all post api-------------------


        // post api for admin add tool page ( admin ,dashboard) 
        app.post('/tool',verifyJWT , async(req , res) => {
            const data = req.body
            const result = await toolsCollection.insertOne(data)
            res.send(result)
        })

        // user buy tool post api from buy now page (user)
        app.post('/sellTool', async (req, res) => {
            const sellTool = req.body
            const result = await soldToolsCollection.insertOne(sellTool)
            res.send(result)
        })

        // user review post api for add review page (user , dashboard)
        app.post('/review',verifyJWT, async (req, res) => {
            const review = req.body
            const result = await reviewsCollection.insertOne(review)
            res.send(result)
        })

        // ------------Payment 
        app.post('/create-payment-intent',verifyJWT, async (req, res) => {
            const service = req.body
            const price = service.price
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency:'usd',
                payment_method_types:['card']
            })
            console.log(paymentIntent.id)
            res.send({clientSecret:paymentIntent.client_secret})
        })
         
            // ------------------- down all put api ----------------



        // update api for sell tool quantity  buy tool page (user)
         app.put('/tool/:id', async(req , res) => {
            const id = req.params.id
            const filter ={_id:ObjectId(id)}
            const data = req.body
            const options = { upsert: true };
            const updateDoc = {$set: {...data } };
            const result = await toolsCollection.updateOne(filter, updateDoc, options);
            res.send(result);
         })
         
        //  update user profile for user/admin  edit profile page (dashboard)
        app.put('/user/:email', async(req , res) => {
            const email = req.params.email
            const filter ={email:email}
            const data = req.body
            const options = { upsert: true };
            const updateDoc = {$set: {...data } };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
         })

        //   user update with token for signIn and signUp page
        app.put('/newUser/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = {email:email}
            const options = { upsert: true };
            const updateDoc = {$set:user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({email:email},process.env.ACCESS_TOKEN,{ expiresIn: '48h'})
            res.send({result ,token});
        })

        //  make user admin for make admin (user page) (admin , dashboard)
        app.put('/user/admin/:email',verifyJWT, async (req, res) => {
            const email = req.params.email
            const requester = req.decoded.email
            const requesterAccount = await usersCollection.findOne({email:requester})
            if(requesterAccount.role === 'admin') {
                const filter = {email:email}
                const updateDoc = {$set:{role:'admin'} };
                const result = await usersCollection.updateOne(filter, updateDoc);
                return res.send(result );
            }
            else{
              return  res.status(403).send({message:'forbidden access'})
            }
           
        })

        // update sold tool for payment (payment page)
        app.put('/moneypayment/:id', async(req, res) => {
            const id = req.params.id
            const filter = {_id:ObjectId(id)}
            const soldTool = req.body
            const options = {upsert:true}
            const updateDoc = {$set:{...soldTool}}
            const result =  await soldToolsCollection.updateOne(filter,updateDoc ,options)
            res.send(result)
        })


        // --------------- down all delete api -----------------------

        // delete tools for manage tools (admin , dashboard)
         app.delete('/tool/:id',async(req, res) =>{
            const toolId = req.params.id;
            const filter = {_id:ObjectId(toolId)}
            const result = await toolsCollection.deleteOne(filter)
            res.send(result);
         })

        // delete user order unpaid tool order page (user , dashboard)
        app.delete('/soldTool/:id',async(req, res) =>{
            const soldToolId = req.params.id;
            const filter = {_id:ObjectId(soldToolId)}
            const result = await soldToolsCollection.deleteOne(filter)
            res.send(result);
         })
    }
    finally{
    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello from bengal tools server')
})

app.listen(port , (req, res) => {
    console.log('listening on port 5000')
})