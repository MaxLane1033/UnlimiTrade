// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// ********************** DEFAULT WELCOME TESTCASE ****************************

describe('Server!', () => {
  // Sample test case given to test / endpoint.
  it('Returns the default welcome message', done => {
    chai
      .request(server)
      .get('/welcome')
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.status).to.equals('success');
        assert.strictEqual(res.body.message, 'Welcome!');
        done();
      });
  });
});

// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// ********************************************************************************

describe('POST /register API', () => {
  it('Positive Test: Register with valid user', done => {
    chai
      .request(server)
      .post('/register')
      .send({ username: 'test38', password: 'p33p10' })
      .end((err, res) => {
        expect(res).to.have.status(200);
        expect(res.body.message).to.equals('Success, well done.');
        done();
      });
  });


  it('Negative Test: Register with invalid user', done => {
    chai
      .request(server)
      .post('/register')
      .send({ username: '', password: 'password' }) 
      .end((err, res) => {
        expect(res).to.have.status(400);
        expect(res.body.message).to.equals('Invalid input!');
        done();
      });
  });
});


// NEXT 2 UNIT TESTS BELOW: 


describe('Profile Route Tests', () => {
  let agent;
  const testUser = {
    username: 'testprofileuser',
    password: 'profilepass123',
  };

  beforeEach(() => {
    agent = chai.request.agent(server);
  });

  afterEach(() => {
    agent.close();
  });

  describe('GET /profile', () => {

    it('Negative Test: should return 401 if user is not authenticated', done => {
      chai
        .request(server)
        .get('/profile')
        .end((err, res) => {
          expect(res).to.have.status(401);
          expect(res.text).to.equal('Not authenticated');
          done();
        });
    });

    it('Positive Test: should return user profile when authenticated', async () => {
      // Register user if not already created (safe for multiple runs)
      await agent.post('/register').send(testUser);
      await agent.post('/login').send(testUser);

      const res = await agent.get('/profile');

      expect(res).to.have.status(200);
      expect(res.body).to.be.an('object');
      expect(res.body).to.have.property('username', testUser.username);
    });

  });
});

