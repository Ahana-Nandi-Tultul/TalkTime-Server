const express = require('express');
const app = express();
var jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: {status: true, message: 'unauthorized access'}});
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decode) => {
    if(error){
      return res.status(401).send({error: {status: true, message: 'unauthorized access'}});
    }
    req.decode = decode;
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.epxwefd.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.post('/jwt', (req, res) => {
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1hr'})
    res.send({token})
})



async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db('talkTime').collection('users');
    const classCollection = client.db('talkTime').collection('classes');
    const cartCollection = client.db('talkTime').collection('carts');

    const verifyInstructor = async(req, res, next)=> {
      const email = req.decode.email;
      const query = {email: email};
      const result = await userCollection.findOne(query);
      if(!result){
        return res.status(401).send({error: {status: true, message: 'unauthorized access'}});
      }
      if(result.role === 'Instructor'){
        next();
      }
    }

    const verifyAdmin = async(req, res, next) =>{
      const email = req.decode.email;
      const query = {email: email};
      const result = await userCollection.findOne(query);
      if(result.role === 'Admin'){
        
        next();
      }
    }
    // user related api
    app.get('/users',verifyJwt, async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/:email', verifyJwt, async(req, res) => {
      const email = req.params.email;
      if(email !== req.decode.email){
        return res.status(403).send({error: {status: true, message: 'forbidden access'}});
      }

      const query = {email: req.decode.email};
      const result = await userCollection.findOne(query);

      if(!result){
        return res.status(401).send({error: {status: true, message: 'unauthorized access'}});
      }
      if(result.role === 'Instructor'){
        return  res.send({isInstructor : true});
      }
      else if(result.role === 'Admin'){
        return  res.send({isAdmin : true});
      }
      else if(result.role === 'Student'){
        return  res.send({isStudent : true});
      }
      else{
        return res.status(401).send({error: {status: true, message: 'unauthorized access'}});
      }

    })

    app.patch('/users/:id', verifyJwt, async(req, res) => {
      const id = req.params.id;
      const role = req.body;
      const filter = {_id: new ObjectId(id)};
      const newRole = {
        $set: role
      }
      const result = await userCollection.updateOne(filter, newRole);
      res.send(result);
    })

    app.post('/users', async(req, res) => {
        const newUser = req.body;
        const email = newUser?.email;
        const filter = {email: email};
        const existUser = await userCollection.findOne(filter);
        if(existUser){
          return res.send({});
        }
        const result = await userCollection.insertOne(newUser);
        res.send(result);
    })

    app.delete('/users/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // class related api
    app.get('/allclasses', verifyJwt, async(req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    })

    app.get('/topclasses', async(req, res) => {
      const result = await classCollection.find().sort({ enrolledStudents: -1 }).limit(6).toArray();
      res.send(result);
    })  

    app.post('/classes', verifyJwt, verifyInstructor, async(req, res) => {
      const newClass = req.body.newClass;
      console.log(newClass);
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.patch('/classes/:id', verifyJwt, verifyAdmin, async(req, res) => {
      const classid = req.params.id;
      const filter = {_id: new ObjectId(classid)};
      const status = req.body.status;
      const newStatus = {
        $set: {status}
      };
      const result = await classCollection.updateOne(filter, newStatus);
      res.send(result);
    });

    app.put('/classes/:id', verifyJwt, verifyAdmin, async(req, res) => {
      const classId = req.params.id;
      const filter = {_id : new ObjectId(classId)};
      const feedback = req.body.feedback;
      const newFeedback = {
        $set: {feedback}
      };
      const result = await classCollection.updateOne(filter, newFeedback);
      res.send(result);
    });

    app.patch('/updateClass/:id', verifyJwt, verifyInstructor, async(req, res) => {
      const classId = req.params.id;
      const filter = {_id: new ObjectId(classId)};
      const updateInfo = req.body.updateInfo;
      const newUpdateInfo = {
        $set : {
          courseName: updateInfo?.courseName,
          coursePrice : updateInfo?.coursePrice,
          seats : updateInfo?.seats,
          status: updateInfo?.status
        }
      }
      const result = await classCollection.updateOne(filter, newUpdateInfo)
      res.send(result);
    })

    app.get('/allclassesStu', async(req, res) =>{
      const filter = {status: 'approved'};
      const result = await classCollection.find(filter).toArray();
      res.send(result);
    })

    

    // instructor related api
    app.get('/instructors/:id', async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const result = await userCollection.findOne(filter);
      res.send(result);
    })

    app.get('/instructors/classes/:email', async(req, res) => {
      const email = req.params.email;
      const filter = {email: email};
      const result = await classCollection.find(filter).toArray();
      res.send(result);
    })

    // top instructors
    app.get('/topinstructors', async(req, res) => {
      const pipeline = [
        {
          $match: { role: "Instructor" }
        },
        {
          $lookup: {
            from: "classes",
            localField: "email",
            foreignField: "email",
            as: "classes"
          }
        },
        {
          $unwind: "$classes"
        },
        {
          $group: {
            _id: {
              instructorId: "$_id",
              instructor: "$name",
              photo: "$photo",
              email: "$email"
            },
            totalEnrolledStudents: { $sum: "$classes.enrolledStudents" },
            totalClasses: { $sum: 1 },
            courseNames: { $push: "$classes.courseName" },
            classIds: { $push: "$classes._id" }
          }
        },
        {
          $project: {
            _id: "$_id.instructorId",
            instructor: "$_id.instructor",
            email: "$_id.email",
            photo: "$_id.photo",
            totalEnrolledStudents: 1,
            totalClasses: 1,
            courseNames: 1,
            classIds: 1
          }
        },
        {
          $sort: { totalEnrolledStudents: -1 }
        },
        {
          $limit: 6
        }
      ];
      
            
      const result = await userCollection.aggregate(pipeline).toArray();
      res.send(result);
    })


    // all-instructor
    app.get('/allinstructors', async(req, res) => {
      const pipeline = [
          {
            $match: { role: "Instructor" }
          },
          {
            $lookup: {
              from: "classes",
              localField: "email",
              foreignField: "email",
              as: "instructorClasses"
            }
          },
          {
            $project: {
              _id: 1,
              instructor: "$name",
              email: "$email",
              photo: "$photo", // Use 'image' as 'photo'
              totalClasses: { $size: "$instructorClasses" },
              courseNames: "$instructorClasses.courseName"
            }
          }
       ];

      const result = await userCollection.aggregate(pipeline).toArray();
      res.send(result);
      
    })

    // cart related api
    app.get('/carts/:email', async(req, res) => {
      const email = req.params.email;
      const filter = {email: email};
      const result = await cartCollection.find(filter).toArray();
      res.send(result);
    });

    app.post('/carts', verifyJwt, async(req, res) => {
      const item = req.body.item;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    })
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Time is talikg in different languages');
})

app.listen(port, () => {
    console.log('TalkTime is listenting on port:', port)
})