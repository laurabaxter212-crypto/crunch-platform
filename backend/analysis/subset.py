def subset_variants_by_genes(gene_lists, combine, gene_to_var):
    sets = []
    for genes in gene_lists:
        idxs = [set(gene_to_var[g]) for g in genes if g in gene_to_var]
        if idxs:
            sets.append(set.union(*idxs))

    if not sets:
        return []

    if combine == "intersection":
        return list(set.intersection(*sets))
    return list(set.union(*sets))

