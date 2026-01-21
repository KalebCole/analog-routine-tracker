/**
 * Azure Functions HTTP Trigger
 *
 * Wraps the Express app to run as an Azure Functions HTTP trigger.
 * This allows the existing Express routes to work in a serverless environment.
 */

import { app as azureApp, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import serverlessExpress from '@vendia/serverless-express';
import expressApp from '../app';

// Create the serverless Express handler
const handler = serverlessExpress({ app: expressApp });

// Register the HTTP trigger for all API routes
azureApp.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api/{*segments}',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    context.log(`HTTP ${request.method} ${request.url}`);
    return handler(request, context);
  },
});
