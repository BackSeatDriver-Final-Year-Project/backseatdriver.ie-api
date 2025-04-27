# Back Seat Driver - Express API

## Project Overview
Back Seat Driver is a telematics-focused application designed to provide drivers with insights into their driving habits, vehicle performance, and recommendations for safer, more efficient driving. The Express API serves as the backend for user authentication, vehicle data management, and app-related functionalities. It uses JWT authentication, MySQL for data storage, and caching mechanisms for optimized performance.

## Features
- User authentication using JWT
- Secure password storage with bcrypt
- Vehicle data retrieval with caching for performance optimization
- CRUD operations for managing app-related data
- Search functionality for records

## Technologies Used
- Node.js with Express.js
- MySQL (using mysql2)
- JWT for authentication
- bcrypt for password hashing
- NodeCache for caching
- CORS for handling cross-origin requests

## Installation & Setup
### Prerequisites
- Node.js installed
- MySQL database configured
- Environment variables set up for security

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/your-repo/backseatdriver-api.git
   ```
2. Install dependencies:
   ```sh
   cd backseatdriver-api
   npm install --force
   ```
3. Configure environment variables:
   ```sh
   export JWT_SECRET=your_jwt_secret_key
   export DB_PASSWORD=your_database_password
   ```
4. Start the server:
   ```sh
   node index.js
   ```

## API Endpoints
### Authentication
#### Register User
**POST** `/register`
- Request Body:
  ```json
  {
    "username": "user123",
    "password": "securepassword"
  }
  ```
- Response:
  ```json
  {
    "message": "User registered successfully"
  }
  ```

#### Login User
**POST** `/login`
- Request Body:
  ```json
  {
    "username": "user123",
    "password": "securepassword"
  }
  ```
- Response:
  ```json
  {
    "token": "your_jwt_token"
  }
  ```

### Vehicle Data
#### Get Vehicles (Authenticated)
**GET** `/vehicles`
- Headers:
  ```sh
  Authorization: Bearer your_jwt_token
  ```
- Response:
  ```json
  [
    {
      "id": 1,
      "make": "Toyota",
      "model": "Corolla",
      "year": 2020
    }
  ]
  ```

### App Data Management
#### Retrieve All App Records
**POST** `/app_endpoint`
- Response:
  ```json
  [
    {
      "id": 1,
      "name": "Sample App",
      "description": "An example entry."
    }
  ]
  ```

#### Retrieve Family Records
**POST** `/app_endpoint_family`
- Response:
  ```json
  [
    {
      "id": 1,
      "name": "John Doe",
      "funeral_time": "2024-06-15"
    }
  ]
  ```

#### Insert a Family Record
**POST** `/api/app_list_family`
- Request Body:
  ```json
  {
    "Name": "John Doe",
    "Address": "123 Main St",
    "Time": "10:00 AM",
    "Description": "Funeral Service",
    "Personal_msg": "Loving father",
    "Family_flowers": "Yes",
    "Donations": "Charity",
    "Funeral_arrangement": "Private",
    "Date_published": "2024-06-14",
    "Funeral_time": "2024-06-15",
    "Image": "image_url"
  }
  ```
- Response:
  ```json
  {
    "message": "Data inserted successfully",
    "id": 1
  }
  ```

### Search Functionality
#### Search for App Records
**GET** `/search_app`
- Query Parameters:
  - `firstname` (optional)
  - `lastname` (optional)
- Response:
  ```json
  [
    {
      "id": 1,
      "name": "Jane Doe"
    }
  ]
  ```

### Posting New Data
#### Add a Record to App List
**POST** `/posttoapp`
- Request Body:
  ```json
  {
    "fullname": "Jane Doe",
    "county": "Galway"
  }
  ```
- Response:
  ```json
  {
    "message": "Record added successfully"
  }
  ```

## Security Considerations
- Ensure `JWT_SECRET` and `DB_PASSWORD` are stored in environment variables
- Implement rate limiting to prevent abuse
- Sanitize user input to prevent SQL injection
- Hash passwords using bcrypt

## Future Enhancements
- Implement role-based access control
- Introduce logging and monitoring
- Optimize query performance
- Enhance caching mechanisms

## Author
Caolán Maguire - Final Year Project (Back Seat Driver)

