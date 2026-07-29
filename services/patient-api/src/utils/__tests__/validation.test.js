const express = require('express');
const Joi = require('joi');
const request = require('supertest');
const { validate } = require('../validation');

describe('request body validation', () => {
  test('preserves arrays while normalizing nested empty strings', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/validate',
      validate(Joi.object({
        orders: Joi.array().items(Joi.object({
          testId: Joi.number().integer().required(),
          notes: Joi.string().allow(null)
        })).required()
      })),
      (req, res) => res.json(req.validatedData)
    );

    const response = await request(app)
      .post('/validate')
      .send({ orders: [{ testId: 1, notes: '' }] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      orders: [{ testId: 1, notes: null }]
    });
  });
});
