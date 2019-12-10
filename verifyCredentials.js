const authTypes = {
  BASIC: 'Basic Auth',
  DIGEST: 'Digest Auth',
};

/**
 * Executes the verification logic by checking that fields are not empty using the provided apiKey.
 *
 * @param credentials object to retrieve apiKey from
 * @returns Promise which resolves true
 */
function verify(credentials) {
  this.logger.info('credentials:', JSON.stringify(credentials));
  // access the value of the auth field defined in credentials section of component.json
  // eslint-disable-next-line no-unused-vars
  const { type, basic, digest } = credentials.auth;

  if (type === authTypes.BASIC) {
    if (!basic.username) {
      this.logger.info('Error: Username is required for basic auth');
      throw new Error('Username is required for basic auth');
    }

    if (!basic.password) {
      this.logger.info('Error: Password is required for basic auth');
      throw new Error('Password is required for basic auth');
    }
  }

  return Promise.resolve(true);
}

module.exports = verify;
