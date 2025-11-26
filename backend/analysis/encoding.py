import numpy as np

def encode_genotypes(gt):
    g = gt[:,:,0] + gt[:,:,1]    # 0/1/2
    g[g < 0] = -1                # missing
    return g

