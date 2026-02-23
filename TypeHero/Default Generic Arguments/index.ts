/**
 * Context:
 * - https://github.com/LuigiEspinosa/my-studies/blob/main/TypeHero/Default%20Generic%20Arguments.md
 */

type Method = 'POST' | 'GET' | 'DELETE' | 'PATCH' | 'PUT';

type ApiRequest<T, TMethod extends Method = 'GET'> = {
  data: T,
  method: TMethod
};

type TSConfig<T = { strict: true }> = T;
