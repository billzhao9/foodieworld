import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { generate } from '../server/upstream';
const schema = z.object({ prompt: z.string() });
it('repairs a completed malformed receipt once with a distinct stable request ID', async () => {
 const upstream = vi.fn().mockResolvedValueOnce({text:'{"prompt":"A turtle enters.",""}'}).mockResolvedValueOnce({text:'{"prompt":"A turtle enters."}'});
 expect(await generate(upstream,'action-1','Original',schema)).toEqual({prompt:'A turtle enters.'});
 expect(upstream).toHaveBeenCalledTimes(2);
 expect(upstream.mock.calls[1][1]).toMatchObject({requestId:'action-1_json_repair_v1'});
});
it('does not retry an unknown upstream outcome', async () => {
 const upstream=vi.fn().mockRejectedValue(new Error('unknown'));
 await expect(generate(upstream,'action-1','Original',schema)).rejects.toThrow('unknown');
 expect(upstream).toHaveBeenCalledTimes(1);
});
it.each(['still invalid', '{"prompt":null}'])('rejects a failed repair without another attempt: %s', async text => {
 const upstream=vi.fn().mockResolvedValueOnce({text:'invalid'}).mockResolvedValueOnce({text});
 await expect(generate(upstream,'action-1','Original',schema)).rejects.toMatchObject({code:'INVALID_AI_OUTPUT'});
 expect(upstream).toHaveBeenCalledTimes(2);
});
