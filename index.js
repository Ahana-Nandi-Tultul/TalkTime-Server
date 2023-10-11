const express = require('express');
const app = express();
var jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_SECRET);
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://talktime-2e686.web.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});


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
    // await client.connect();

    const userCollection = client.db('talkTime').collection('users');
    const classCollection = client.db('talkTime').collection('classes');
    const cartCollection = client.db('talkTime').collection('carts');
    const paymentCollection = client.db('talkTime').collection('payments');


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

    app.get('/allinnumbers', async(req, res) => {
      const insResult = await userCollection.countDocuments({role: 'Instructor'});
      const stuResult = await userCollection.countDocuments({role: 'Student'});
      const courseResult = await classCollection.countDocuments({status: 'approved'});
      res.send({insResult, stuResult, courseResult});
    })

    // user related api
    app.get('/users',verifyJwt, verifyAdmin, async(req, res) => {
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

    app.patch('/users/:id', verifyJwt, verifyAdmin, async(req, res) => {
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

    app.delete('/users/:id', verifyJwt, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // class related api
    app.get('/allclasses', verifyJwt, verifyAdmin, async(req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    })

    app.get('/topclasses', async(req, res) => {
      const result = await classCollection.find().sort({ enrolledStudents: -1 }).limit(6).toArray();
      res.send(result);
    })  

    app.get('/classes/:email', async(req, res) => {
      const email = req.params.email;
      const query = {email : email};
      const result = await classCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/insClass/:email', verifyJwt, verifyInstructor, async(req, res) =>{
      const email = req.params.email;
      const query = {email : email};
      const result = await classCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/classes', verifyJwt, verifyInstructor, async(req, res) => {
      const newClass = req.body.newClass;
      // console.log(newClass);
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    // class approve, denied
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

    // give feedback on class info
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

    // change class information 
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
      const filter = {email: email, status: 'approved'};
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
            $match: { role: "Instructor"}
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
              photo: "$photo", 
              status: { $arrayElemAt: ["$instructorClasses.status", 0] },
              totalClasses: { $size: "$instructorClasses" },
              courseNames: {
                $cond: {
                  if: { $eq: [{ $arrayElemAt: ["$instructorClasses.status", 0] }, "approved"] },  
                  then: "$instructorClasses.courseName", 
                  else: []
                }
          
              }
              
            }
          }
       ];

      const result = await userCollection.aggregate(pipeline).toArray();
      res.send(result);
      
    })

    // cart related api
    app.get('/carts/:email', verifyJwt,  async(req, res) => {
      const email = req.params.email;
      const filter = {studentEmail: email};
      const result = await cartCollection.find(filter).toArray();
      res.send(result);
    });

    app.post('/carts', verifyJwt, async(req, res) => {
      const item = req.body.item;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/carts/:id', verifyJwt, async(req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    })

    // payments related api
    app.get('/payments/:email', verifyJwt,  async(req,res) => {
      const stuEmail = req.params.email;
      const pipeline = [
        {
          $match: { email: stuEmail }
        },
       
        {
          $addFields: {
            classesIdObjectIds: {
              $map: {
                input: '$classesId',
                as: 'classId',
                in: { $toObjectId: '$$classId' }
              }
            }
          }
        },
        {
          $unwind: '$classesIdObjectIds'
        },
        
        {
          $lookup: {
            from: 'classes',
            localField: 'classesIdObjectIds',
            foreignField: '_id',
            as: 'classDetails'
          }
        },
        {
          $unwind: '$classDetails'
        },
        {
          $project: {
            _id: 1,
            instructor: '$classDetails.instructor',
            coursePrice: '$classDetails.coursePrice',
            courseName: '$classDetails.courseName',
            InstructrorEmail: '$classDetails.email',
            image: '$classDetails.image',
            coursePrice: '$classDetails.coursePrice'
            
          }
        },
      ];
  
      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);
      
    })
    app.post('/create-payment-intent', verifyJwt, async(req, res) => {
      const {price} = req.body;
      const amount = parseInt(price * 100);
      const payment = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types : ['card']
      });
      res.send({
        clientSecret : payment.client_secret
      })
    });

    app.post('/payments', verifyJwt, async(req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      for (const classId of payment.classesId) {
        // console.log(classId);
        await classCollection.updateOne(
          { _id: new ObjectId(classId), seats: { $gt: 0 } },
          { $inc: { seats: -1, enrolledStudents: 1 } }
        );
      }
      const query = {
        _id: {$in : payment.cartItems.map(id => new ObjectId(id))}
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({deleteResult});
    });

    app.get('/payments/history/:email', verifyJwt, async(req, res) => {
      const email = req.params.email;
      const query = {
        email: email
      }
      const result = await paymentCollection.find(query).sort({date : -1 }).toArray();
      res.send(result);
    })

    app.get("/admin_stats", verifyJwt, verifyAdmin, async(req, res) => {
      const payments = await paymentCollection.find().toArray();
      const totalRevenue = payments.reduce((sum, item) => item.price + sum, 0);
      const students = await userCollection.countDocuments({role: "Student"});
      const instructors = await userCollection.countDocuments({role: "Instructor"});
      const classes = await classCollection.countDocuments();
      const deniedClasses = await classCollection.countDocuments({status: "denied"});
      
      res.send({totalRevenue, students, instructors, classes, deniedClasses});
    })

    app.get('/payments_chartData',verifyJwt, verifyAdmin, async(req, res) => {
      const pipeline = [
        {
          $addFields: {
            classesIdObjectIds: {
              $map: {
                input: '$classesId',
                as: 'classId',
                in: { $toObjectId: '$$classId' }
              }
            }
          }
        },
        {
          $unwind: '$classesIdObjectIds'
        },
        
        {
          $lookup: {
            from: 'classes',
            localField: 'classesIdObjectIds',
            foreignField: '_id',
            as: 'classDetails'
          }
        },
        {
          $unwind: '$classDetails'
        },
        {
          $project: {
            _id: 1,
            instructor: '$classDetails.instructor',
            coursePrice: '$classDetails.coursePrice',
            courseName: '$classDetails.courseName',
            InstructrorEmail: '$classDetails.email',
            coursePrice: '$classDetails.coursePrice',
            enrolledStudents : "$classDetails.enrolledStudents"
            
          }
        },
      ];
      const studentWiseClasses = await paymentCollection.aggregate(pipeline).toArray();
      res.send(studentWiseClasses);
    })
    
    app.get('/instructor_stats/:email', verifyJwt, verifyInstructor, async(req, res) => {
      const email = req.params.email;
      const allclassesNum = await classCollection.countDocuments({email: email});
      const allclasses = await classCollection.find({email: email}).toArray();
      const students = allclasses.reduce((sum, item) => item.enrolledStudents + sum, 0);
      res.send({allclassesNum, students, allclasses});
    });

    app.get('/student_stats/:email', async(req, res) => {
      const email = req.params.email;
      const pipeline = [
        {
          $match: { email: email }
        },
       
        {
          $addFields: {
            classesIdObjectIds: {
              $map: {
                input: '$classesId',
                as: 'classId',
                in: { $toObjectId: '$$classId' }
              }
            }
          }
        },
        {
          $unwind: '$classesIdObjectIds'
        },
        
        {
          $lookup: {
            from: 'classes',
            localField: 'classesIdObjectIds',
            foreignField: '_id',
            as: 'classDetails'
          }
        },
        {
          $unwind: '$classDetails'
        },
        {
          $project: {
            _id: 1,
            instructor: '$classDetails.instructor',
            coursePrice: '$classDetails.coursePrice',
            courseName: '$classDetails.courseName',
            InstructrorEmail: '$classDetails.email',
            image: '$classDetails.image',
            coursePrice: '$classDetails.coursePrice'
            
          }
        },
      ];
  
      const result = await paymentCollection.aggregate(pipeline).toArray();
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
    res.send('Time is talking in different languages');
})

app.listen(port, () => {
    console.log('TalkTime is listenting on port:', port)
})